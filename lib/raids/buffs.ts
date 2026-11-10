// Buffs que recibe cada jugador de sus compañeros, frente a los demás que reciben el mismo buff del mismo lanzador
// (normalmente su party). Sale de «buffs_recibidos» del data.json (db/raid.sql): % de su tiempo vivo con el buff, en
// los intentos en que lo recibió. Quien lo tiene bastante menos que el resto probablemente se queda fuera de su
// alcance (por ejemplo, el sanador que va detrás del tanque): es una deducción. Puro: tests/unit/buffs.test.ts.

export type BuffDato = { jugador: string; lanzador: string; habilidad: string; activo_pct: number; vivo_s: number };
export type Receptor = { jugador: string; pct: number; vivoS: number; mediana: number | null; bajo: boolean };
export type GrupoBuff = { lanzador: string; habilidad: string; receptores: Receptor[] };
export type AnalisisBuffs = { buffs: GrupoBuff[]; bajos: { jugador: string; lanzador: string; habilidad: string; pct: number; mediana: number }[] };

// Umbrales: un 25 % menos que la mediana de los demás receptores y al menos 8 puntos menos, con un minuto vivo
const RATIO = 0.75, PUNTOS = 8, MIN_VIVO_S = 60;

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
};

export function analizarBuffs(datos: BuffDato[], grupo: string[]): AnalisisBuffs {
  const por = new Map<string, BuffDato[]>();
  for (const d of datos) {
    if (!grupo.includes(d.jugador) || !grupo.includes(d.lanzador)) continue;
    const k = d.lanzador + '|' + d.habilidad;
    por.set(k, [...(por.get(k) ?? []), d]);
  }
  const buffs: GrupoBuff[] = [...por.values()].filter((l) => l.length >= 2).map((l) => ({
    lanzador: l[0].lanzador, habilidad: l[0].habilidad,
    receptores: l.map((d) => {
      const otros = l.filter((x) => x !== d && x.vivo_s >= MIN_VIVO_S).map((x) => x.activo_pct);
      const m = mediana(otros);
      const r1 = m === null ? null : Math.round(m * 10) / 10;
      return {
        jugador: d.jugador, pct: d.activo_pct, vivoS: d.vivo_s, mediana: r1,
        bajo: m !== null && d.vivo_s >= MIN_VIVO_S && d.activo_pct <= RATIO * m && m - d.activo_pct >= PUNTOS,
      };
    }).sort((a, b) => (a.jugador < b.jugador ? -1 : 1)),
  })).sort((a, b) => (a.lanzador < b.lanzador ? -1 : a.lanzador > b.lanzador ? 1 : a.habilidad < b.habilidad ? -1 : 1));
  const bajos = buffs.flatMap((b) => b.receptores.filter((r) => r.bajo).map((r) => ({ jugador: r.jugador, lanzador: b.lanzador, habilidad: b.habilidad, pct: r.pct, mediana: r.mediana! })));
  return { buffs, bajos };
}

/** Para la IA: solo quien recibe un buff bastante menos que sus compañeros. */
export function buffsParaIA(a: AnalisisBuffs) {
  return a.bajos.map((b) => ({ jugador: b.jugador, buff: b.habilidad, de: b.lanzador, su_tiempo_con_el_buff_pct: b.pct, el_de_los_demas_pct: b.mediana }));
}
