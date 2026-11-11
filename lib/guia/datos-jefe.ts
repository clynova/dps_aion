// Datos en vivo de la ficha de un jefe (módulo «Raids», fase 3): todas las raids públicas con ese jefe como principal,
// juntas, con lib/raids/jefe.ts (muro, cronograma, causas) y, para cada mecánica de la ficha, las muertes y el momento
// de sus ataques. Puro (sin base): se prueba en tests/unit/guia-datos.test.ts. Solo totales: ni grupos ni raids.
//
// Los % de la guía son de vida que le QUEDA al jefe (como en las fichas): vida = 100 − % de vida quitada.
import { analizarJefe, type AnalisisJefe, type AtaqueCronograma, type RaidJefe } from '@/lib/raids/jefe';
import type { EspecializacionDato } from '@/lib/raids/especializaciones';
import { repasarMuerte, type MuerteDato, type RepasoDato } from '@/lib/raids/repaso';

export type DatosMecanica = {
  /** Muertes por los ataques de la mecánica en todas las raids, y por intento */
  muertes: number; porIntento: number;
  /** El ataque de la mecánica que más intentos tiene en el cronograma: cuándo sale por primera vez y si se repite */
  momento: { habilidad: string; vida: number; segundo: number; cadaS: number | null; porVida: boolean; intentos: number; posibles: number } | null;
};
export type DatosJefeGuia = {
  analisis: AnalisisJefe;
  intentos: number;
  /** Kill más rápido, en segundos (null sin kill) */
  killMasRapido: number | null;
  mecanicas: Record<string, DatosMecanica>;
  /** Lo que más mata, con muertes por intento */
  causas: { habilidad: string; total: number; porIntento: number }[];
  /** El tramo de 5 % con más wipes, en vida que le queda al jefe */
  atasco: { desde: number; hasta: number; wipes: number; total: number; cierre: string | null } | null;
  /** Ataques que salen siempre al mismo % de vida (marcas del gráfico), de más vida a menos */
  porVida: { habilidad: string; vida: number }[];
  /** Composición de los kills, GS y crítico por clase (fase 4) */
  equipo: EquipoJefe;
  /** Habilidades, especializaciones y defensivos de cada clase contra este jefe (fase 5) */
  porClase: ClaseJefe[];
};

const r2 = (x: number) => Math.round(x * 100) / 100;
export const vidaRestante = (pctQuitado: number) => Math.round((100 - pctQuitado) * 10) / 10;

/** Del cronograma, la entrada de esos ataques que más intentos tiene (a igualdad, la que sale antes). */
function momentoDe(cronograma: AtaqueCronograma[], ataques: number[]): DatosMecanica['momento'] {
  const ids = new Set(ataques.map(String));
  const mias = cronograma.filter((c) => ids.has(c.habilidad));
  if (!mias.length) return null;
  const c = mias.reduce((m, x) => (x.intentos > m.intentos || (x.intentos === m.intentos && x.primeroS < m.primeroS) ? x : m));
  const cadaS = c.cadaS ?? mias.find((x) => x.cadaS !== null)?.cadaS ?? null;
  return { habilidad: c.habilidad, vida: vidaRestante(c.primeroPct), segundo: c.primeroS, cadaS, porVida: c.disparador === 'vida', intentos: c.intentos, posibles: c.posibles };
}

export function datosJefeGuia(raids: RaidConGrupo[], mecanicas: { id: string; ataques: number[] }[]): DatosJefeGuia | null {
  if (!raids.length) return null;
  const analisis = analizarJefe(raids);
  const intentos = analisis.totales.intentos;

  const muertes = new Map<string, number>();
  for (const r of raids) for (const c of r.datos.causas ?? []) if (c.habilidad) muertes.set(c.habilidad, (muertes.get(c.habilidad) ?? 0) + c.muertes);
  const por = (n: number) => (intentos ? r2(n / intentos) : 0);

  const datosMec: Record<string, DatosMecanica> = {};
  for (const m of mecanicas) {
    if (!m.ataques.length) continue;
    const n = m.ataques.reduce((s, a) => s + (muertes.get(String(a)) ?? 0), 0);
    datosMec[m.id] = { muertes: n, porIntento: por(n), momento: momentoDe(analisis.cronograma, m.ataques) };
  }

  const causas = [...muertes].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6)
    .map(([habilidad, total]) => ({ habilidad, total, porIntento: por(total) }));

  const totalWipes = analisis.muro.reduce((s, m) => s + m.wipes, 0);
  const peor = analisis.muro.reduce<AnalisisJefe['muro'][number] | null>((m, x) => (!m || x.wipes > m.wipes ? x : m), null);
  const atasco = peor && peor.wipes ? { desde: 100 - peor.desde, hasta: 95 - peor.desde, wipes: peor.wipes, total: totalWipes, cierre: peor.cierre?.habilidad ?? null } : null;

  const kills = analisis.noches.map((n) => n.killS).filter((k): k is number => k !== null);
  return {
    equipo: equipoJefe(raids),
    porClase: porClase(raids),
    analisis, intentos, killMasRapido: kills.length ? Math.min(...kills) : null, mecanicas: datosMec, causas, atasco,
    porVida: analisis.cronograma.filter((c) => c.disparador === 'vida' && c.primeroPct >= 5).map((c) => ({ habilidad: c.habilidad, vida: vidaRestante(c.primeroPct) }))
      .sort((a, b) => b.vida - a.vida),
  };
}

// ── Equipo y grupo (fase 4): composición de los kills, GS y crítico por clase ─────────────────────────────

/** Lo que la guía lee de cada raid además de lo que usa lib/raids/jefe.ts. */
export type RaidConGrupo = RaidJefe & {
  datos: RaidJefe['datos'] & {
    jugadores?: { jugador: string; clase_id: string; gs: number; crit_pct: number }[];
    dps_intento?: { intento: number; jugador: string }[];
    detalle?: Record<string, { habilidades?: { habilidad: string; pct: number }[]; muertes?: MuerteDato[] }>;
    especializaciones?: EspecializacionDato[];
  };
};
type Rango = { min: number; mediana: number; max: number; n: number };
export type EquipoJefe = {
  /** Cada kill: cuántos jugadores de cada clase había en el intento del kill */
  kills: Record<string, number>[];
  /** Por clase: media de jugadores por kill y en cuántos kills estuvo */
  clasesKill: { clase: string; media: number; kills: number }[];
  /** GS de quien estaba en los intentos con kill, y de todos los que lo intentaron */
  gsKill: Rango | null; gsTodos: Rango | null;
  /** % de golpes críticos contra el jefe de cada jugador en cada raid, por clase */
  critico: { clase: string; mediana: number; min: number; max: number; n: number }[];
};

const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rango = (xs: number[]): Rango | null => (xs.length ? { min: Math.min(...xs), mediana: Math.round(med(xs)), max: Math.max(...xs), n: xs.length } : null);

export function equipoJefe(raids: RaidConGrupo[]): EquipoJefe {
  const kills: Record<string, number>[] = [];
  const gsKill: number[] = [], gsTodos: number[] = [];
  const crit = new Map<string, number[]>();
  for (const r of raids) {
    const js = new Map((r.datos.jugadores ?? []).map((j) => [j.jugador, j]));
    for (const j of js.values()) {
      if (j.gs > 0) gsTodos.push(j.gs);
      if (j.crit_pct > 0) crit.set(j.clase_id, [...(crit.get(j.clase_id) ?? []), j.crit_pct]);
    }
    for (const k of r.datos.intentos.filter((i) => i.matado)) {
      const enKill = [...new Set((r.datos.dps_intento ?? []).filter((d) => d.intento === k.intento).map((d) => d.jugador))].map((n) => js.get(n)).filter((j) => !!j);
      if (!enKill.length) continue;
      const c: Record<string, number> = {};
      for (const j of enKill) { c[j.clase_id] = (c[j.clase_id] ?? 0) + 1; if (j.gs > 0) gsKill.push(j.gs); }
      kills.push(c);
    }
  }
  const clases = [...new Set(kills.flatMap((k) => Object.keys(k)))];
  const clasesKill = clases.map((clase) => ({
    clase, media: Math.round((kills.reduce((s, k) => s + (k[clase] ?? 0), 0) / kills.length) * 10) / 10, kills: kills.filter((k) => k[clase]).length,
  })).sort((a, b) => b.media - a.media || (a.clase < b.clase ? -1 : 1));
  const critico = [...crit].map(([clase, xs]) => ({ clase, mediana: Math.round(med(xs) * 10) / 10, min: Math.min(...xs), max: Math.max(...xs), n: xs.length }))
    .sort((a, b) => b.mediana - a.mediana || (a.clase < b.clase ? -1 : 1));
  return { kills, clasesKill, gsKill: rango(gsKill), gsTodos: rango(gsTodos), critico };
}

// ── Por clase (fase 5): habilidades, especializaciones y defensivos contra este jefe ─────────────────────

export type ClaseJefe = {
  clase: string;
  /** Jugador-raid de esa clase (un jugador en dos raids cuenta dos veces) y jugadores distintos */
  registros: number; jugadores: number;
  /** Las habilidades con más cuota del daño de la clase: cuota media (los que no la usan cuentan 0) y parte de los registros que la usan */
  habilidades: { habilidad: string; cuota: number; uso: number; especializacion: { opciones: string; veces: number; de: number } | null }[];
  /** Muertes con repaso, cuántas con algún defensivo propio libre (no en las de un golpe) y cuáles */
  muertes: number; conDefensivo: number; defensivos: { habilidad: string; veces: number }[];
};

const TOP_HABILIDADES = 6;

export function porClase(raids: RaidConGrupo[]): ClaseJefe[] {
  type Acum = { registros: number; nombres: Set<string>; hab: Map<string, { suma: number; usan: number }>; esp: Map<string, Map<string, number>>; muertes: number; conDef: number; def: Map<string, number> };
  const por = new Map<string, Acum>();
  for (const r of raids) {
    const espDe = new Map<string, EspecializacionDato[]>();
    for (const e of r.datos.especializaciones ?? []) espDe.set(e.jugador, [...(espDe.get(e.jugador) ?? []), e]);
    for (const j of r.datos.jugadores ?? []) {
      if (!j.clase_id) continue;
      const a = por.get(j.clase_id) ?? { registros: 0, nombres: new Set(), hab: new Map(), esp: new Map(), muertes: 0, conDef: 0, def: new Map() };
      a.registros++; a.nombres.add(j.jugador);
      const d = r.datos.detalle?.[j.jugador];
      for (const h of d?.habilidades ?? []) {
        if (!h.habilidad || h.pct < 1) continue;
        const x = a.hab.get(h.habilidad) ?? { suma: 0, usan: 0 };
        x.suma += h.pct; x.usan++;
        a.hab.set(h.habilidad, x);
      }
      for (const e of espDe.get(j.jugador) ?? []) {
        const m = a.esp.get(e.habilidad) ?? new Map<string, number>();
        m.set(e.opciones, (m.get(e.opciones) ?? 0) + 1);
        a.esp.set(e.habilidad, m);
      }
      for (const m of d?.muertes ?? []) {
        if (!m.repaso) continue;
        const rm = repasarMuerte(j.jugador, m as MuerteDato & { repaso: RepasoDato });
        a.muertes++;
        if (rm.libres.length) a.conDef++;
        for (const h of new Set(rm.libres)) a.def.set(h, (a.def.get(h) ?? 0) + 1);
      }
      por.set(j.clase_id, a);
    }
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return [...por].map(([clase, a]) => ({
    clase, registros: a.registros, jugadores: a.nombres.size,
    habilidades: [...a.hab].map(([habilidad, x]) => ({ habilidad, cuota: r1(x.suma / a.registros), uso: r1((100 * x.usan) / a.registros) }))
      .sort((x, y) => y.cuota - x.cuota || (x.habilidad < y.habilidad ? -1 : 1)).slice(0, TOP_HABILIDADES)
      .map((h) => {
        const m = a.esp.get(h.habilidad);
        if (!m) return { ...h, especializacion: null };
        const [opciones, veces] = [...m].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0];
        return { ...h, especializacion: { opciones, veces, de: [...m.values()].reduce((s2, n) => s2 + n, 0) } };
      }),
    muertes: a.muertes, conDefensivo: a.conDef,
    defensivos: [...a.def].map(([habilidad, veces]) => ({ habilidad, veces })).sort((x, y) => y.veces - x.veces || (x.habilidad < y.habilidad ? -1 : 1)).slice(0, 3),
  })).sort((x, y) => y.registros - x.registros || (x.clase < y.clase ? -1 : 1));
}
