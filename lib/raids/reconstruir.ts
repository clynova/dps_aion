// Vuelve a montar el data.json de una raid desde las tablas (lo usan la API de lectura, las páginas y la prueba de
// paridad). Mismo orden de claves y de listas que db/raid.sql. Lo que la v1 no traía (apoyo, supervivencia, rotación,
// vida antes de cada muerte) solo aparece si la raid lo tiene.
import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import * as t from '@/lib/db/schema';

/** Nombre en español de cada clase, como lo escribe db/raid.sql en jugadores[].clase */
export const CLASE_ES: Record<string, string> = {
  templar: 'Templario', assassin: 'Asesino', elementalist: 'Espiritualista', cleric: 'Clérigo', sorcerer: 'Hechicero',
  gladiator: 'Gladiador', ranger: 'Arquero', chanter: 'Cantor', fighter: 'Luchador',
};

type Fila<T extends { $inferSelect: unknown }> = T['$inferSelect'];

export async function reconstruirRaid(raidId: string) {
  const [raid] = await db.select().from(t.raids).where(eq(t.raids.id, raidId)).limit(1);
  if (!raid) return null;
  const por = <T>(f: Promise<T>) => f;
  const [otros, intentos, curva, casteos, rj, dpsInt, muertes, desglose, reparto, mitig] = await Promise.all([
    por(db.select().from(t.raidOtros).where(eq(t.raidOtros.raidId, raidId)).orderBy(asc(t.raidOtros.orden))),
    por(db.select().from(t.intentos).where(eq(t.intentos.raidId, raidId)).orderBy(asc(t.intentos.n))),
    por(db.select().from(t.curva).where(eq(t.curva.raidId, raidId)).orderBy(asc(t.curva.intento), asc(t.curva.orden))),
    por(db.select().from(t.casteosJefe).where(eq(t.casteosJefe.raidId, raidId)).orderBy(asc(t.casteosJefe.intento), asc(t.casteosJefe.orden))),
    por(db.select({ f: t.raidJugador, nombre: t.jugadores.nombre }).from(t.raidJugador).innerJoin(t.jugadores, eq(t.jugadores.id, t.raidJugador.jugadorId))
      .where(eq(t.raidJugador.raidId, raidId)).orderBy(asc(t.raidJugador.orden))),
    por(db.select({ f: t.dpsIntento, nombre: t.jugadores.nombre }).from(t.dpsIntento).innerJoin(t.jugadores, eq(t.jugadores.id, t.dpsIntento.jugadorId))
      .where(eq(t.dpsIntento.raidId, raidId))),
    por(db.select().from(t.muertes).where(eq(t.muertes.raidId, raidId)).orderBy(asc(t.muertes.jugadorId), asc(t.muertes.intento), asc(t.muertes.orden))),
    por(db.select().from(t.desglose).where(eq(t.desglose.raidId, raidId)).orderBy(asc(t.desglose.tipo), asc(t.desglose.orden))),
    por(db.select({ f: t.repartoCura, objetivo: t.jugadores.nombre }).from(t.repartoCura).innerJoin(t.jugadores, eq(t.jugadores.id, t.repartoCura.objetivoId))
      .where(eq(t.repartoCura.raidId, raidId)).orderBy(asc(t.repartoCura.orden))),
    por(db.select().from(t.mitigacion).where(eq(t.mitigacion.raidId, raidId))),
  ]);

  const agrupar = <T extends { jugadorId: number }>(filas: T[]) => {
    const m = new Map<number, T[]>(); for (const f of filas) { const l = m.get(f.jugadorId); if (l) l.push(f); else m.set(f.jugadorId, [f]); }
    return m;
  };
  const muertesDe = agrupar(muertes), desgloseDe = agrupar(desglose), mitigDe = agrupar(mitig);
  const repartoDe = agrupar(reparto.map((r) => ({ ...r.f, objetivo: r.objetivo })));
  const deTipo = (filas: Fila<typeof t.desglose>[] | undefined, tipo: string) => (filas ?? []).filter((f) => f.tipo === tipo);

  // Causas: no se guardan; se agrupan las muertes (mismo criterio que db/raid.sql: más muertes primero y, a igualdad,
  // la que pasó antes). Los empates exactos dentro del mismo segundo pueden salir en otro orden (como en raid.sql).
  const causas = new Map<string, { habilidad: string; origen: string; muertes: number; golpe_max: number; primera: number }>();
  for (const m of muertes) {
    const k = `${m.habilidad}|${m.origen}`;
    const c = causas.get(k) ?? { habilidad: m.habilidad ?? '', origen: m.origen ?? '', muertes: 0, golpe_max: 0, primera: Infinity };
    c.muertes++; c.golpe_max = Math.max(c.golpe_max, m.golpeMax ?? 0); c.primera = Math.min(c.primera, m.intento * 100000 + m.t);
    causas.set(k, c);
  }

  const detalle: Record<string, unknown> = {};
  for (const { f: j, nombre } of rj) {
    const des = desgloseDe.get(j.jugadorId);
    const d: Record<string, unknown> = {
      habilidades: deTipo(des, 'dano').map((x) => ({ habilidad: x.habilidad, dano: x.valor, pct: x.pct, golpes: x.golpes, crit_pct: x.extra?.crit_pct ?? null })),
      recibido: deTipo(des, 'recibido').map((x) => ({ habilidad: x.habilidad, dano: x.valor, golpes: x.golpes, golpe_max: x.extra?.golpe_max ?? null })),
      muertes: (muertesDe.get(j.jugadorId) ?? []).map((m) => ({
        intento: m.intento, t: m.t, habilidad: m.habilidad, origen: m.origen, golpe_max: m.golpeMax,
        ...(m.vida5s !== null ? { vida_5s: m.vida5s, vida_1s: m.vida1s, dano_5s: m.dano5s, cura_5s: m.cura5s } : {}),
      })),
    };
    if (j.curacion !== null) {
      d.apoyo = {
        curacion: j.curacion, escudos: j.escudos, absorbido: j.absorbido,
        cura_hab: deTipo(des, 'cura').map((x) => ({ habilidad: x.habilidad, cantidad: x.valor, pct: x.pct, golpes: x.golpes })),
        cura_obj: (repartoDe.get(j.jugadorId) ?? []).map((r) => ({ jugador: r.objetivo, cantidad: r.cantidad, pct: r.pct })),
        escudo_hab: deTipo(des, 'escudo').map((x) => ({ habilidad: x.habilidad, cantidad: x.valor })),
      };
    }
    if (j.golpesRecibidos !== null) {
      const mi = mitigDe.get(j.jugadorId) ?? [];
      d.supervivencia = {
        golpes: j.golpesRecibidos, cura_recibida: j.curaRecibida, escudo_recibido: j.escudoRecibido, resurrecciones: j.resurrecciones, bajo30_pct: j.bajo30Pct,
        mitigados: Object.fromEntries(mi.filter((x) => !x.evitado).map((x) => [x.tipo, x.n])),
        evitados: Object.fromEntries(mi.filter((x) => x.evitado).map((x) => [x.tipo, x.n])),
      };
    }
    if (j.casteos !== null) {
      d.rotacion = {
        usos: j.casteos, interrumpidos: j.interrumpidos, vivo_s: j.vivoS, usos_min: j.casteosMin, pausas_pct: j.pausasPct, primer_golpe_s: j.primerGolpeS,
        usos_hab: deTipo(des, 'casteo').map((x) => ({ habilidad: x.habilidad, usos: x.valor, intervalo_s: x.extra?.intervalo_s ?? null })),
        buffs: deTipo(des, 'buff').map((x) => ({ habilidad: x.habilidad, activo_pct: x.valor, receptores: x.extra?.receptores ?? null })),
      };
    }
    detalle[nombre] = d;
  }

  return {
    meta: raid.meta,
    resumen: {
      intentos: raid.intentos, matado: raid.matado, kill_s: raid.killS, minutos_combate: raid.minutosCombate, mejor_pct: raid.mejorPct,
      mejor_intento: raid.mejorIntento, muertes_grupo: raid.muertesGrupo, dps_grupo_medio: raid.dpsGrupoMedio, hp_jefe: raid.hpJefe,
    },
    otros: otros.map((o) => ({ npc: o.npc, jefe: o.jefe, intentos: o.intentos, matado: o.matado, kill_s: o.killS, dps_raid: o.dpsRaid })),
    intentos: intentos.map((i) => ({ intento: i.n, duracion_s: i.duracionS, progreso_pct: i.progresoPct, matado: i.matado, dps_grupo: i.dpsGrupo,
      muertes: i.muertes, rotura_s: i.roturaS, ultima_causa: i.ultimaCausa })),
    curva: curva.map((c) => ({ intento: c.intento, t: c.t, progreso: c.progreso })),
    jugadores: rj.map(({ f: j, nombre }) => ({
      jugador: nombre, clase: CLASE_ES[j.claseId ?? ''] ?? j.claseId, clase_id: j.claseId, ...(j.servidor !== null ? { servidor: j.servidor } : {}), gs: j.gs, cp: j.cp, dps: j.dps, hps: j.hps,
      dano_recibido: j.danoRecibido, muertes: j.muertes, crit_pct: j.critPct, espalda_pct: j.espaldaPct,
    })),
    // Como raid.sql: por intento y nombre (orden binario, el de DuckDB)
    dps_intento: dpsInt.map((x) => ({ intento: x.f.intento, jugador: x.nombre, dps: x.f.dps, muertes: x.f.muertes }))
      .sort((a, b) => a.intento - b.intento || (a.jugador < b.jugador ? -1 : a.jugador > b.jugador ? 1 : 0)),
    causas: [...causas.values()].sort((a, b) => b.muertes - a.muertes || a.primera - b.primera)
      .map(({ habilidad, origen, muertes: n, golpe_max }) => ({ habilidad, origen, muertes: n, golpe_max })),
    casteos: casteos.map((c) => ({ intento: c.intento, t: c.t, habilidad: c.habilidad })),
    detalle,
  };
}

export async function raidPorSlug(grupoId: string, slug: string) {
  const [r] = await db.select({ id: t.raids.id, visibilidad: t.raids.visibilidad, subidoPor: t.raids.subidoPor }).from(t.raids)
    .where(and(eq(t.raids.grupoId, grupoId), eq(t.raids.slug, slug))).limit(1);
  return r ?? null;
}
