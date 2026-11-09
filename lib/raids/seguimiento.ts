// Seguimiento de las recomendaciones: qué cambió desde la raid anterior del mismo jefe. Compara las cifras del grupo,
// las de los ataques que nombraban las recomendaciones de aquel análisis y las de cada jugador. Puro (sin base ni
// red): se prueba en tests/unit/seguimiento.test.ts. Las cifras van por intento para poder comparar noches de
// distinta duración; un «mejor» no demuestra que se siguiera el consejo, solo que el número mejoró.
import type { MecanicaDato } from './mecanicas';

export type Veredicto = 'mejor' | 'igual' | 'peor';
export type Medida = { antes: number | null; ahora: number | null; veredicto: Veredicto | null };

/** Lo que se usa de una raid (el data.json reconstruido). */
export type RaidSeg = {
  meta: { fecha: string; grupo: string[] };
  resumen: { intentos: number; matado: boolean; mejor_pct: number | null; muertes_grupo: number | null; dps_grupo_medio: number | null };
  jugadores: { jugador: string; dps: number | null; muertes: number | null }[];
  dps_intento?: { intento: number; jugador: string }[];
  causas: { habilidad: string; muertes: number }[];
  detalle: Record<string, { muertes?: { habilidad: string | null }[]; recibido?: { habilidad: string }[] }>;
  mecanicas?: MecanicaDato[];
};
/** Lo que se usa del análisis de la raid anterior. */
export type AnalisisSeg = { pendiente?: boolean; recomendaciones?: { titulo: string; texto: string }[]; jugadores?: Record<string, string[]> };

export type AtaqueSeg = {
  habilidad: string;
  /** Muertes por intento con este ataque (del grupo, o del jugador en su fila) */
  muertes: Medida;
  /** % de las veces que salió con el jugador vivo en que le dio. Solo si las dos raids traen «mecanicas». */
  tasa: Medida;
  /** false = no dejó rastro en esa raid (ni golpes ni muertes): no dio a nadie o no se llegó a esa fase */
  vistoAntes: boolean; vistoAhora: boolean;
};
export type RecoSeg = { titulo: string; ataques: AtaqueSeg[]; veredicto: Veredicto | null };
export type JugadorSeg = { jugador: string; muertes: Medida; dps: Medida; ataques: AtaqueSeg[] };
export type Seguimiento = {
  anterior: { fecha: string; intentos: number; matado: boolean };
  actual: { intentos: number; matado: boolean };
  grupo: { muertes: Medida; mejor_pct: Medida; dps: Medida };
  /** Las recomendaciones al grupo del análisis anterior (vacío si aquella raid no tenía análisis) */
  recomendaciones: RecoSeg[];
  /** Jugadores que estuvieron en las dos raids, en el orden de la tabla de esta */
  jugadores: JugadorSeg[];
  /** Las dos raids traen «mecanicas»: se puede comparar la frecuencia con que da cada ataque */
  conTasas: boolean;
};

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Compara dos valores. Cambia si la diferencia supera `rel` (relativo al valor de antes) y `min` (absoluto); si no, «igual».
 */
export function medir(antes: number | null, ahora: number | null, menosEsMejor: boolean, rel: number, min = 0): Medida {
  if (antes === null || ahora === null) return { antes, ahora, veredicto: null };
  const d = ahora - antes;
  const cambia = d !== 0 && Math.abs(d) >= min && Math.abs(d) >= rel * Math.abs(antes);
  return { antes, ahora, veredicto: !cambia ? 'igual' : (d < 0) === menosEsMejor ? 'mejor' : 'peor' };
}

// Umbrales: un 20 % (y al menos 0,15 muertes por intento, o 5 puntos de frecuencia) para muertes y golpes; 3 puntos
// de vida del jefe; un 5 % de DPS.
const muertesM = (a: number | null, b: number | null) => medir(a, b, true, 0.2, 0.15);
const tasaM = (a: number | null, b: number | null) => medir(a, b, true, 0.2, 5);
const dpsM = (a: number | null, b: number | null) => medir(a, b, false, 0.05);

/** Ids de 6 a 8 cifras de un texto, sin repetir y en orden de aparición */
export const idsEnTexto = (s: string) => [...new Set(s.match(/\b\d{6,8}\b/g) ?? [])];

function indice(r: RaidSeg) {
  const intentos = Math.max(1, r.resumen.intentos);
  const muertes = new Map<string, number>();
  for (const c of r.causas) if (c.habilidad) muertes.set(c.habilidad, (muertes.get(c.habilidad) ?? 0) + c.muertes);
  const mec = new Map((r.mecanicas ?? []).map((m) => [m.habilidad, m]));
  const vistos = new Set<string>([...muertes.keys(), ...mec.keys()]);
  for (const d of Object.values(r.detalle)) for (const x of d.recibido ?? []) vistos.add(x.habilidad);
  const intentosDe = new Map<string, number>();
  for (const x of r.dps_intento ?? []) intentosDe.set(x.jugador, (intentosDe.get(x.jugador) ?? 0) + 1);
  return {
    intentos, muertes, mec, vistos,
    intentosDe: (n: string) => Math.max(1, intentosDe.get(n) ?? intentos),
    // % de salidas en que el ataque dio (a un jugador o, sin nombre, a cualquiera de los expuestos)
    tasa: (hab: string, jugador?: string): number | null => {
      const m = mec.get(hab); if (!m) return null;
      const js = jugador ? m.jugadores.filter((j) => j.jugador === jugador) : m.jugadores;
      const e = js.reduce((s, j) => s + j.expuesto, 0);
      return e ? Math.round((1000 * js.reduce((s, j) => s + j.olas, 0)) / e) / 10 : null;
    },
  };
}

/** Compara la raid `actual` con la `anterior` del mismo jefe; `analisis` es el de la anterior (puede faltar). */
export function seguir(actual: RaidSeg, anterior: RaidSeg, analisis?: AnalisisSeg | null): Seguimiento {
  const A = indice(anterior), B = indice(actual);
  const conTasas = A.mec.size > 0 && B.mec.size > 0;
  const esAtaque = (id: string) => A.vistos.has(id) || B.vistos.has(id);

  const ataque = (hab: string, jugador?: string): AtaqueSeg => {
    const vistoAntes = A.vistos.has(hab), vistoAhora = B.vistos.has(hab);
    const propias = (r: RaidSeg) => (r.detalle[jugador!]?.muertes ?? []).filter((m) => m.habilidad === hab).length;
    const antes = !vistoAntes ? null : jugador ? propias(anterior) / A.intentosDe(jugador) : (A.muertes.get(hab) ?? 0) / A.intentos;
    const ahora = !vistoAhora ? null : jugador ? propias(actual) / B.intentosDe(jugador) : (B.muertes.get(hab) ?? 0) / B.intentos;
    return {
      habilidad: hab, vistoAntes, vistoAhora,
      muertes: muertesM(antes === null ? null : r2(antes), ahora === null ? null : r2(ahora)),
      tasa: conTasas && vistoAntes && vistoAhora ? tasaM(A.tasa(hab, jugador), B.tasa(hab, jugador)) : { antes: null, ahora: null, veredicto: null },
    };
  };

  const recos = analisis && !analisis.pendiente ? analisis.recomendaciones ?? [] : [];
  const recomendaciones: RecoSeg[] = recos.map((r) => {
    const ataques = idsEnTexto(`${r.titulo} ${r.texto}`).filter(esAtaque).slice(0, 6).map((id) => ataque(id));
    // El veredicto de la recomendación: las muertes de sus ataques juntas; si nadie murió por ellos, la frecuencia con que dan
    const medibles = ataques.filter((a) => a.vistoAntes && a.vistoAhora);
    let veredicto: Veredicto | null = null;
    if (medibles.length) {
      const suma = (k: 'antes' | 'ahora') => medibles.reduce((s, a) => s + (a.muertes[k] ?? 0), 0);
      if (suma('antes') || suma('ahora')) veredicto = muertesM(suma('antes'), suma('ahora')).veredicto;
      else {
        const conTasa = medibles.filter((a) => a.tasa.antes !== null && a.tasa.ahora !== null);
        const media = (k: 'antes' | 'ahora') => conTasa.reduce((s, a) => s + a.tasa[k]!, 0) / conTasa.length;
        veredicto = conTasa.length ? tasaM(media('antes'), media('ahora')).veredicto : 'igual';
      }
    }
    return { titulo: r.titulo, ataques, veredicto };
  });

  const jugAntes = new Map(anterior.jugadores.map((j) => [j.jugador, j]));
  const consejos = analisis && !analisis.pendiente ? analisis.jugadores ?? {} : {};
  const jugadores: JugadorSeg[] = actual.jugadores.filter((j) => jugAntes.has(j.jugador)).map((j) => {
    const a = jugAntes.get(j.jugador)!;
    return {
      jugador: j.jugador,
      muertes: muertesM(a.muertes === null ? null : r2(a.muertes / A.intentosDe(j.jugador)), j.muertes === null ? null : r2(j.muertes / B.intentosDe(j.jugador))),
      dps: dpsM(a.dps, j.dps),
      ataques: idsEnTexto((consejos[j.jugador] ?? []).join(' ')).filter(esAtaque).slice(0, 4).map((id) => ataque(id, j.jugador)),
    };
  });

  const porIntento = (r: RaidSeg, n: number) => (r.resumen.muertes_grupo === null ? null : r2(r.resumen.muertes_grupo / n));
  // El mejor intento: si ahora cae el jefe y antes no, es mejor aunque el % ya fuera alto
  const pct = medir(anterior.resumen.mejor_pct, actual.resumen.mejor_pct, false, 0, 3);
  if (actual.resumen.matado !== anterior.resumen.matado) pct.veredicto = actual.resumen.matado ? 'mejor' : 'peor';
  return {
    anterior: { fecha: anterior.meta.fecha, intentos: anterior.resumen.intentos, matado: anterior.resumen.matado },
    actual: { intentos: actual.resumen.intentos, matado: actual.resumen.matado },
    grupo: { muertes: muertesM(porIntento(anterior, A.intentos), porIntento(actual, B.intentos)), mejor_pct: pct, dps: dpsM(anterior.resumen.dps_grupo_medio, actual.resumen.dps_grupo_medio) },
    recomendaciones, jugadores, conTasas,
  };
}

/** Versión compacta para la IA (lib/analisis/resumen.ts): [antes, ahora, resultado]. */
export function seguimientoParaIA(s: Seguimiento) {
  const m = (x: Medida) => [x.antes, x.ahora, x.veredicto ?? 'sin comparar'] as const;
  const at = (a: AtaqueSeg) => ({
    habilidad: a.habilidad,
    ...(a.vistoAntes && a.vistoAhora ? { muertes_por_intento: m(a.muertes), ...(a.tasa.antes !== null && a.tasa.ahora !== null ? { veces_que_da_pct: m(a.tasa) } : {}) }
      : { nota: a.vistoAhora ? 'no aparecía en la raid anterior' : 'no aparece en esta raid (no dio a nadie o no se llegó a esa fase)' }),
  });
  return {
    raid_anterior: s.anterior,
    grupo: { muertes_por_intento: m(s.grupo.muertes), mejor_pct: m(s.grupo.mejor_pct), dps_grupo: m(s.grupo.dps) },
    recomendaciones_anteriores: s.recomendaciones.map((r) => ({ titulo: r.titulo, resultado: r.veredicto ?? 'sin medir', ataques: r.ataques.map(at) })),
    jugadores: s.jugadores.map((j) => ({ jugador: j.jugador, muertes_por_intento: m(j.muertes), dps: m(j.dps), ...(j.ataques.length ? { ataques_de_sus_consejos: j.ataques.map(at) } : {}) })),
  };
}
