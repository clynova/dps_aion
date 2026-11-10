// Página de un jefe: todas las raids de un grupo contra él, juntas. Evolución noche a noche, dónde se atascan los
// intentos (muro histórico), cronograma de sus ataques deducido de todos los intentos y qué mata en cada noche. Sale de
// datos que traen todas las raids (intentos, curva, casteos y causas). Puro (sin base ni red): se prueba en
// tests/unit/jefe.test.ts.
//
// Cronograma: para cada ataque del jefe se mira el primer casteo de cada intento, en segundos y en % de vida quitada.
// Si sale siempre al mismo segundo, sale «por tiempo»; si sale siempre al mismo %, «por vida» (un umbral de fase); si
// el tiempo entre dos casteos seguidos es casi siempre el mismo, «se repite cada X s». Es una deducción con umbrales
// fijos: el juego no dice qué dispara cada ataque.

export type IntentoJefe = { intento: number; duracion_s: number; progreso_pct: number; matado: boolean; muertes: number | null; ultima_causa?: string | null };
export type RaidJefe = {
  slug: string;
  /** meta.fecha, ISO con la zona de quien grabó */
  fecha: string;
  datos: {
    resumen?: { dps_grupo_medio?: number | null; muertes_grupo?: number | null; kill_s?: number | null };
    intentos: IntentoJefe[];
    curva?: { intento: number; t: number; progreso: number }[];
    casteos?: { intento: number; t: number; habilidad: string }[];
    causas?: { habilidad: string; muertes: number }[];
  };
};

export type Noche = {
  slug: string; fecha: string; intentos: number; matado: boolean; killS: number | null;
  /** Mejor progreso (100 si hubo kill) y mediana de los intentos que pasaron del 5 % */
  mejor: number; mediana: number | null;
  muertesPorIntento: number | null; dpsGrupo: number | null;
  /** Progreso final de cada intento, para el gráfico */
  progresos: { intento: number; pct: number; matado: boolean }[];
};
export type Disparador = 'tiempo' | 'vida' | null;
export type AtaqueCronograma = {
  habilidad: string;
  /** En cuántos intentos sale, de los que llegaron hasta ese punto del combate, y cuántos casteos suma */
  intentos: number; posibles: number; veces: number;
  /** Mediana del primer casteo de cada intento: segundo y % de vida quitada al jefe */
  primeroS: number; primeroPct: number;
  disparador: Disparador;
  /** Se repite con un intervalo casi fijo (null si no) */
  cadaS: number | null;
};
export type AnalisisJefe = {
  noches: Noche[];
  totales: { noches: number; intentos: number; comparables: number; pulls: number; mejor: { pct: number; slug: string; fecha: string } | null; kill: { slug: string; fecha: string; killS: number | null } | null };
  /** Wipes (intentos sin kill que pasaron del 5 %) por tramo de 5 % de vida quitada, con el ataque que más veces los cierra */
  muro: { desde: number; wipes: number; cierre: { habilidad: string; veces: number } | null }[];
  cronograma: AtaqueCronograma[];
  /** Los ataques que más matan en total, con sus muertes por intento en cada noche (null si esa noche no mató) */
  causas: { habilidad: string; total: number; porNoche: (number | null)[] }[];
};

// Umbrales
export const MIN_PCT = 5;          // por debajo, un pull que salió mal: no cuenta para medianas, muro ni cronograma
const MIN_INTENTOS = 3;            // intentos en que sale un ataque para deducir su disparador
const TIEMPO_S = 2;                // dispersión (rango intercuartílico) del primer casteo: 2 s…
const TIEMPO_REL = 0.03;           // …o un 3 % de su segundo
const VIDA_PCT = 1;                // del % de vida: 1 punto…
const VIDA_REL = 0.03;             // …o un 3 %
const REPITE_S = 2, REPITE_REL = 0.1, MIN_REPETICIONES = 3;
const TOP_CAUSAS = 8;

const r1 = (x: number) => Math.round(x * 10) / 10;
/** Cuantil con interpolación lineal (como numpy por defecto). */
export function cuantil(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const p = (s.length - 1) * q, i = Math.floor(p);
  return i + 1 < s.length ? s[i] + (p - i) * (s[i + 1] - s[i]) : s[i];
}
const mediana = (xs: number[]) => cuantil(xs, 0.5);
const iqr = (xs: number[]) => (xs.length < 2 ? 0 : cuantil(xs, 0.75) - cuantil(xs, 0.25));

/** % de vida quitada al jefe en el segundo `t` del intento (interpolando la curva). */
export function progresoEn(curva: { t: number; progreso: number }[], t: number): number {
  for (let i = 1; i < curva.length; i++) {
    const a = curva[i - 1], b = curva[i];
    if (b.t >= t) return b.t === a.t ? b.progreso : a.progreso + ((t - a.t) * (b.progreso - a.progreso)) / (b.t - a.t);
  }
  return curva.at(-1)?.progreso ?? 0;
}

/** Por tiempo, por vida o ninguno, a partir de los primeros casteos (segundos y %) de cada intento. */
export function disparador(segundos: number[], pcts: number[]): Disparador {
  if (segundos.length < MIN_INTENTOS) return null;
  const mT = mediana(segundos), mP = mediana(pcts), dT = iqr(segundos), dP = iqr(pcts);
  // Lo que sale al empezar el combate está a la vez en el segundo 0 y en el 0 %: es por tiempo
  if (mP < 1) return dT <= TIEMPO_S ? 'tiempo' : null;
  const relT = dT / Math.max(mT, 1), relP = dP / Math.max(mP, 1);
  if (dT <= Math.max(TIEMPO_S, TIEMPO_REL * mT) && relT <= relP) return 'tiempo';
  if (dP <= Math.max(VIDA_PCT, VIDA_REL * mP) && relP < relT) return 'vida';
  return null;
}

export function analizarJefe(raids: RaidJefe[]): AnalisisJefe {
  const orden = [...raids].sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha) || (a.slug < b.slug ? -1 : 1));

  const noches: Noche[] = orden.map((r) => {
    const it = r.datos.intentos;
    const kill = it.find((i) => i.matado);
    const comp = it.filter((i) => i.progreso_pct >= MIN_PCT).map((i) => (i.matado ? 100 : i.progreso_pct));
    const muertes = it.reduce((s, i) => s + (i.muertes ?? 0), 0);
    return {
      slug: r.slug, fecha: r.fecha, intentos: it.length, matado: !!kill,
      killS: kill ? (r.datos.resumen?.kill_s ?? kill.duracion_s) : null,
      mejor: kill ? 100 : Math.max(0, ...it.map((i) => i.progreso_pct)),
      mediana: comp.length ? r1(mediana(comp)) : null,
      muertesPorIntento: it.length ? r1((r.datos.resumen?.muertes_grupo ?? muertes) / it.length) : null,
      dpsGrupo: r.datos.resumen?.dps_grupo_medio ?? null,
      progresos: it.map((i) => ({ intento: i.intento, pct: i.matado ? 100 : i.progreso_pct, matado: i.matado })),
    };
  });

  const todos = orden.flatMap((r) => r.datos.intentos.map((i) => ({ r, i })));
  const comparables = todos.filter(({ i }) => i.progreso_pct >= MIN_PCT);
  const mejorN = noches.reduce<Noche | null>((m, n) => (!m || n.mejor > m.mejor ? n : m), null);
  const killN = noches.find((n) => n.matado) ?? null;

  // Muro: wipes por tramo de 5 %
  const tramos = new Map<number, { wipes: number; cierres: Map<string, number> }>();
  for (const { i } of comparables) {
    if (i.matado) continue;
    const desde = Math.min(95, Math.floor(i.progreso_pct / 5) * 5);
    const x = tramos.get(desde) ?? { wipes: 0, cierres: new Map<string, number>() };
    x.wipes++;
    if (i.ultima_causa) x.cierres.set(i.ultima_causa, (x.cierres.get(i.ultima_causa) ?? 0) + 1);
    tramos.set(desde, x);
  }
  const claves = [...tramos.keys()];
  const muro = claves.length ? Array.from({ length: (Math.max(...claves) - Math.min(...claves)) / 5 + 1 }, (_, k) => {
    const desde = Math.min(...claves) + 5 * k, x = tramos.get(desde);
    let cierre: { habilidad: string; veces: number } | null = null;
    for (const [habilidad, veces] of x?.cierres ?? []) if (!cierre || veces > cierre.veces || (veces === cierre.veces && habilidad < cierre.habilidad)) cierre = { habilidad, veces };
    return { desde, wipes: x?.wipes ?? 0, cierre };
  }) : [];

  // Cronograma: primer casteo de cada ataque en cada intento comparable
  const porHab = new Map<string, { s: number[]; p: number[]; huecos: number[]; veces: number }>();
  for (const { r, i } of comparables) {
    const curva = (r.datos.curva ?? []).filter((c) => c.intento === i.intento).sort((a, b) => a.t - b.t);
    const deEste = new Map<string, number[]>();
    for (const c of r.datos.casteos ?? []) if (c.intento === i.intento) deEste.set(c.habilidad, [...(deEste.get(c.habilidad) ?? []), c.t]);
    for (const [h, ts] of deEste) {
      ts.sort((a, b) => a - b);
      const x = porHab.get(h) ?? { s: [], p: [], huecos: [], veces: 0 };
      x.s.push(ts[0]); x.p.push(progresoEn(curva, ts[0])); x.veces += ts.length;
      for (let k = 1; k < ts.length; k++) x.huecos.push(ts[k] - ts[k - 1]);
      porHab.set(h, x);
    }
  }
  const cronograma: AtaqueCronograma[] = [...porHab].filter(([, x]) => x.s.length >= 2).map(([habilidad, x]) => {
    const g = x.huecos.length >= MIN_REPETICIONES ? mediana(x.huecos) : null;
    // Los intentos que llegaron hasta donde sale (el % más bajo en que se le vio salir por primera vez)
    const desde = Math.min(...x.p);
    const posibles = Math.max(x.s.length, comparables.filter(({ i }) => i.matado || i.progreso_pct >= desde).length);
    return {
      habilidad, intentos: x.s.length, posibles, veces: x.veces, primeroS: r1(mediana(x.s)), primeroPct: r1(mediana(x.p)),
      disparador: disparador(x.s, x.p),
      cadaS: g !== null && iqr(x.huecos) <= Math.max(REPITE_S, REPITE_REL * g) ? r1(g) : null,
    };
  }).sort((a, b) => a.primeroS - b.primeroS || (a.habilidad < b.habilidad ? -1 : 1));

  // Causas de muerte: las que más matan en total, por intento de cada noche
  const total = new Map<string, number>();
  for (const r of orden) for (const c of r.datos.causas ?? []) if (c.habilidad) total.set(c.habilidad, (total.get(c.habilidad) ?? 0) + c.muertes);
  const causas = [...total].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, TOP_CAUSAS).map(([habilidad, n]) => ({
    habilidad, total: n,
    porNoche: orden.map((r) => {
      const m = (r.datos.causas ?? []).filter((c) => c.habilidad === habilidad).reduce((s, c) => s + c.muertes, 0);
      return m && r.datos.intentos.length ? r1(m / r.datos.intentos.length) : null;
    }),
  }));

  return {
    noches,
    totales: {
      noches: noches.length, intentos: todos.length, comparables: comparables.length, pulls: todos.length - comparables.length,
      mejor: mejorN ? { pct: mejorN.mejor, slug: mejorN.slug, fecha: mejorN.fecha } : null,
      kill: killN ? { slug: killN.slug, fecha: killN.fecha, killS: killN.killS } : null,
    },
    muro, cronograma, causas,
  };
}
