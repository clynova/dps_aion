// Guarda una raid validada (lib/ingest/esquema.ts) en las tablas, en UNA transacción: crea o actualiza la raid por
// (grupo, slug), borra todas sus filas hijas y las vuelve a insertar. Publicar dos veces lo mismo deja lo mismo.
// Las causas de muerte no se guardan: se calculan desde las muertes (lib/raids/reconstruir.ts).
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db/client';
import * as t from '@/lib/db/schema';
import type { Visibilidad } from '@/lib/permisos';
import type { DatosRaid } from './esquema';
import { huellaRaid, slugJugador } from './huella';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Guardado = { raidId: string; slug: string; nueva: boolean; jugadores: number; filas: number };

/** Id de cada jugador por nombre, creándolo si no existe. Slug único: nombre, o nombre-servidor si ya está cogido. */
async function idsJugadores(tx: Tx, datos: DatosRaid): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const j of datos.jugadores) {
    const servidor = j.servidor ?? null;
    const [ya] = await tx.select({ id: t.jugadores.id }).from(t.jugadores)
      .where(and(eq(t.jugadores.nombre, j.jugador), servidor === null ? sql`${t.jugadores.servidor} is null` : eq(t.jugadores.servidor, servidor))).limit(1);
    if (ya) {
      await tx.update(t.jugadores).set({ claseId: j.clase_id }).where(eq(t.jugadores.id, ya.id));
      ids.set(j.jugador, ya.id);
      continue;
    }
    // Primera raid con servidor de un jugador que ya existía sin él (las raids migradas de la web estática no lo
    // traen): se le asigna, en vez de crear un duplicado «nombre-servidor».
    if (servidor !== null) {
      const [sinServidor] = await tx.select({ id: t.jugadores.id }).from(t.jugadores)
        .where(and(eq(t.jugadores.nombre, j.jugador), sql`${t.jugadores.servidor} is null`)).limit(1);
      if (sinServidor) {
        await tx.update(t.jugadores).set({ servidor, claseId: j.clase_id }).where(eq(t.jugadores.id, sinServidor.id));
        ids.set(j.jugador, sinServidor.id);
        continue;
      }
    }
    const base = slugJugador(j.jugador) || 'jugador';
    const [libre] = await tx.select({ n: sql<number>`count(*)::int` }).from(t.jugadores).where(eq(t.jugadores.slug, base));
    const slug = libre.n === 0 ? base : `${base}-${servidor ?? Date.now().toString(36)}`;
    const [nuevo] = await tx.insert(t.jugadores).values({ nombre: j.jugador, servidor, slug, claseId: j.clase_id }).returning({ id: t.jugadores.id });
    ids.set(j.jugador, nuevo.id);
  }
  return ids;
}

export async function guardarRaid(opciones: {
  grupoId: string; datos: DatosRaid; origen: 'navegador' | 'pc' | 'migracion'; subidoPor?: string | null; visibilidad?: Visibilidad;
}): Promise<Guardado> {
  const { grupoId, datos: d, origen } = opciones;
  return db.transaction(async (tx) => {
    const [grupo] = await tx.select({ vis: t.grupos.visibilidadDefecto }).from(t.grupos).where(eq(t.grupos.id, grupoId)).limit(1);
    if (!grupo) throw new Error('grupo inexistente');
    const ids = await idsJugadores(tx, d);
    const r = d.resumen;
    const columnas = {
      runId: d.meta.run, huella: huellaRaid(d), fecha: new Date(d.meta.fecha), mazmorra: d.meta.mazmorra, npcJefe: d.meta.npc,
      jefe: d.meta.jefe, intentos: r.intentos, matado: r.matado, killS: r.kill_s, minutosCombate: r.minutos_combate,
      mejorPct: r.mejor_pct, mejorIntento: r.mejor_intento, muertesGrupo: r.muertes_grupo, dpsGrupoMedio: r.dps_grupo_medio,
      hpJefe: r.hp_jefe, runMin: d.meta.run_min, limiteMin: d.meta.limite_min, reseteos: d.meta.reseteos,
      grabadoPor: d.meta.personaje, meta: d.meta as Record<string, unknown>, origen, esquemaVersion: d.esquema_version ?? 1,
      sqlVersion: d.sql_version ?? null, extraido: isNaN(Date.parse(d.meta.extraido)) ? null : new Date(d.meta.extraido),
      publicado: new Date(), ...(opciones.subidoPor !== undefined ? { subidoPor: opciones.subidoPor } : {}),
    };
    const [raid] = await tx.insert(t.raids)
      .values({ grupoId, slug: d.meta.slug, visibilidad: opciones.visibilidad ?? grupo.vis, ...columnas })
      .onConflictDoUpdate({ target: [t.raids.grupoId, t.raids.slug], set: { ...columnas, ...(opciones.visibilidad ? { visibilidad: opciones.visibilidad } : {}) } })
      .returning({ id: t.raids.id, nueva: sql<boolean>`(xmax = 0)` });
    const raidId = raid.id;

    // Filas hijas: se borran y se vuelven a escribir (el borrado en cascada no aplica: la raid sigue existiendo)
    for (const tabla of [t.raidOtros, t.intentos, t.curva, t.casteosJefe, t.raidJugador, t.dpsIntento, t.muertes, t.desglose, t.repartoCura, t.mitigacion, t.mecanicas]) {
      await tx.delete(tabla).where(eq(tabla.raidId, raidId));
    }
    let filas = 0;
    const meter = async (tabla: PgTable, valores: object[]) => {
      for (let i = 0; i < valores.length; i += 500) await tx.insert(tabla).values(valores.slice(i, i + 500) as never);
      filas += valores.length;
    };
    const jid = (nombre: string) => { const id = ids.get(nombre); if (id === undefined) throw new Error(`jugador sin id: ${nombre}`); return id; };

    await meter(t.raidOtros, d.otros.map((o, orden) => ({ raidId, orden, npc: o.npc, jefe: o.jefe, intentos: o.intentos, matado: o.matado, killS: o.kill_s, dpsRaid: o.dps_raid })));
    await meter(t.intentos, d.intentos.map((i) => ({ raidId, n: i.intento, duracionS: i.duracion_s, progresoPct: i.progreso_pct, matado: i.matado,
      dpsGrupo: i.dps_grupo, muertes: i.muertes, roturaS: i.rotura_s, ultimaCausa: i.ultima_causa })));
    const ordenPorIntento = new Map<number, number>();
    const siguiente = (k: number) => { const n = ordenPorIntento.get(k) ?? 0; ordenPorIntento.set(k, n + 1); return n; };
    await meter(t.curva, d.curva.map((c) => ({ raidId, intento: c.intento, orden: siguiente(c.intento), t: c.t, progreso: c.progreso })));
    ordenPorIntento.clear();
    await meter(t.casteosJefe, d.casteos.map((c) => ({ raidId, intento: c.intento, orden: siguiente(c.intento), t: c.t, habilidad: c.habilidad })));
    await meter(t.dpsIntento, d.dps_intento.map((x) => ({ raidId, jugadorId: jid(x.jugador), intento: x.intento, dps: x.dps, muertes: x.muertes })));

    const enGrupo = new Set(d.meta.grupo);
    await meter(t.raidJugador, d.jugadores.map((j, orden) => {
      const det = d.detalle[j.jugador];
      const ap = det?.apoyo, sv = det?.supervivencia, ro = det?.rotacion;
      return {
        raidId, jugadorId: jid(j.jugador), orden, servidor: j.servidor ?? null, enGrupo: j.en_grupo ?? enGrupo.has(j.jugador), claseId: j.clase_id, gs: j.gs, cp: j.cp,
        dps: j.dps, hps: j.hps, danoRecibido: j.dano_recibido, muertes: j.muertes, critPct: j.crit_pct, espaldaPct: j.espalda_pct,
        curacion: ap?.curacion ?? null, escudos: ap?.escudos ?? null, absorbido: ap?.absorbido ?? null,
        golpesRecibidos: sv?.golpes ?? null, curaRecibida: sv?.cura_recibida ?? null, escudoRecibido: sv?.escudo_recibido ?? null,
        resurrecciones: sv?.resurrecciones ?? null, bajo30Pct: sv?.bajo30_pct ?? null,
        casteos: ro?.usos ?? null, interrumpidos: ro?.interrumpidos ?? null, vivoS: ro?.vivo_s ?? null,
        casteosMin: ro?.usos_min ?? null, pausasPct: ro?.pausas_pct ?? null, primerGolpeS: ro?.primer_golpe_s ?? null,
      };
    }));

    const desglose: (typeof t.desglose.$inferInsert)[] = [];
    const muertes: (typeof t.muertes.$inferInsert)[] = [];
    const reparto: (typeof t.repartoCura.$inferInsert)[] = [];
    const mitig: (typeof t.mitigacion.$inferInsert)[] = [];
    for (const [nombre, det] of Object.entries(d.detalle)) {
      const jugadorId = jid(nombre);
      const des = (tipo: (typeof t.tipoDesgloseEnum.enumValues)[number], filas: { habilidad: string; valor: number; pct?: number | null; golpes?: number | null; extra?: Record<string, number | null> }[]) =>
        filas.forEach((f, orden) => desglose.push({ raidId, jugadorId, tipo, orden, habilidad: f.habilidad, valor: f.valor, pct: f.pct ?? null, golpes: f.golpes ?? null, extra: f.extra ?? null }));
      des('dano', det.habilidades.map((h) => ({ habilidad: h.habilidad, valor: h.dano, pct: h.pct, golpes: h.golpes, extra: { crit_pct: h.crit_pct } })));
      des('recibido', det.recibido.map((h) => ({ habilidad: h.habilidad, valor: h.dano, golpes: h.golpes, extra: { golpe_max: h.golpe_max } })));
      if (det.apoyo) {
        des('cura', det.apoyo.cura_hab.map((h) => ({ habilidad: h.habilidad, valor: h.cantidad, pct: h.pct, golpes: h.golpes })));
        des('escudo', det.apoyo.escudo_hab.map((h) => ({ habilidad: h.habilidad, valor: h.cantidad })));
        det.apoyo.cura_obj.forEach((o, orden) => reparto.push({ raidId, jugadorId, objetivoId: jid(o.jugador), orden, cantidad: o.cantidad, pct: o.pct }));
      }
      if (det.rotacion) {
        des('casteo', det.rotacion.usos_hab.map((h) => ({ habilidad: h.habilidad, valor: h.usos, extra: { intervalo_s: h.intervalo_s } })));
        des('buff', det.rotacion.buffs.map((h) => ({ habilidad: h.habilidad, valor: h.activo_pct, extra: { receptores: h.receptores } })));
      }
      if (det.supervivencia) {
        for (const [tipo, n] of Object.entries(det.supervivencia.mitigados)) mitig.push({ raidId, jugadorId, tipo, n, evitado: false });
        for (const [tipo, n] of Object.entries(det.supervivencia.evitados)) mitig.push({ raidId, jugadorId, tipo, n, evitado: true });
      }
      const porIntento = new Map<number, number>();
      for (const m of det.muertes) {
        const orden = porIntento.get(m.intento) ?? 0; porIntento.set(m.intento, orden + 1);
        muertes.push({ raidId, jugadorId, intento: m.intento, orden, t: m.t, habilidad: m.habilidad, origen: m.origen, golpeMax: m.golpe_max,
          vida5s: m.vida_5s ?? null, vida1s: m.vida_1s ?? null, dano5s: m.dano_5s ?? null, cura5s: m.cura_5s ?? null, repaso: m.repaso ?? null });
      }
    }
    await meter(t.desglose, desglose);
    await meter(t.muertes, muertes);
    await meter(t.repartoCura, reparto);
    await meter(t.mitigacion, mitig);
    await meter(t.mecanicas, (d.mecanicas ?? []).flatMap((m, orden) => m.jugadores.map((j, ordenJugador) => ({
      raidId, jugadorId: jid(j.jugador), habilidad: m.habilidad, orden, ordenJugador, golpesHab: m.golpes, olasHab: m.olas, alcance: m.alcance,
      golpes: j.golpes, olas: j.olas, expuesto: j.expuesto, dano: j.dano, golpeMax: j.golpe_max,
    }))));

    return { raidId, slug: d.meta.slug, nueva: raid.nueva, jugadores: ids.size, filas };
  });
}
