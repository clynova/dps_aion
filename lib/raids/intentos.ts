// Intento contra el mejor intento: en qué punto se separa cada wipe del kill (o, sin kill, del intento que más lejos
// llegó) y por qué. Sale de datos que traen todas las raids (intentos, curva cada 5 % y muertes con su segundo), así que
// no hace falta volver a subir nada. Puro (sin base ni red): se prueba en tests/unit/intentos.test.ts.
//
// Se comparan los dos intentos «a igual progreso»: en cada 5 % de vida del jefe que alcanzaron los dos, cuántos
// segundos tardaron y cuántas muertes llevaban. El primer hito en que el intento va claramente peor (3 muertes más, o un
// 15 % y 10 s más lento) es donde «se separa». Si nunca se separa, iba como el mejor y cayó después de su último hito.
// Comparar a igual progreso deja fuera el wipe final (las muertes del final no cuentan hasta que el otro llega ahí).
// Es una comparación con umbrales fijos: la página y la IA la presentan como deducción.

export type IntentoDato = {
  intento: number; duracion_s: number; progreso_pct: number; matado: boolean; muertes: number | null;
  rotura_s: number | null; ultima_causa?: string | null;
};
export type PuntoCurva = { intento: number; t: number; progreso: number };
export type MuerteDato = { intento: number; t: number; habilidad: string };

export type Punto = { pct: number; s: number; sRef: number; muertes: number; muertesRef: number };
export type Motivo = 'muertes' | 'ritmo' | 'ambos';
export type FilaIntento = {
  intento: number; progreso: number; duracion: number; muertes: number | null; rotura: number | null; ultimaCausa: string | null;
  /** No llegó al 5 %: no hay con qué comparar (un pull que salió mal) */
  corto: boolean;
  /** Primer hito en que va claramente peor que la referencia, y por qué */
  separa: (Punto & { motivo: Motivo }) | null;
  /** Último hito que alcanzaron los dos (si no se separa, iba como la referencia hasta aquí) */
  comun: Punto | null;
  /** Murieron antes del punto de comparación (separa o, si no, comun) y en la referencia no, con su primera muerte */
  caidas: { jugador: string; t: number; habilidad: string }[];
  /** El ataque que más muertes de más causa hasta el punto de comparación frente a la referencia (2 o más de más) */
  causa: { habilidad: string; muertes: number; ref: number } | null;
  /** Desde el último hito común hasta el final del intento: segundos, muertes y el ataque que más mató */
  despues: { s: number; muertes: number; habilidad: string | null; deEse: number } | null;
};
export type ComparacionIntentos = {
  referencia: { intento: number; matado: boolean; progreso: number; duracion: number; muertes: number | null; rotura: number | null };
  /** Los demás intentos, en orden */
  intentos: FilaIntento[];
  /** Columnas de la tabla: cada 10 % que alcanzó algún intento (100 = kill) */
  hitos: number[];
  /** Segundos y muertes acumuladas al llegar a cada hito, por intento (referencia incluida) */
  tabla: { intento: number; celdas: ({ s: number; muertes: number; lento: boolean; muchas: boolean } | null)[] }[];
  /** De los intentos comparables (no cortos): cuántos se separan por cada motivo y cuántos no se separan */
  cuentas: { muertes: number; ritmo: number; ambos: number; ninguno: number; comparables: number };
  /** Jugadores que caen antes que en la referencia, en cuántos intentos */
  jugadores: { jugador: string; intentos: number[] }[];
};

// Umbrales
export const PASO = 5;            // la curva marca cada 5 %
const MIN_PCT = 5;                // un intento por debajo del 5 % es un pull que salió mal
const MUERTES_DE_MAS = 3;         // muertes acumuladas de más para decir que se separa
const RITMO = 1.15;               // y un 15 % más lento…
const RITMO_S = 10;               // …y al menos 10 s
const CAUSA_DE_MAS = 2;           // muertes de más por un ataque para señalarlo

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Segundo en que el intento llega a `pct` (interpolando la curva); null si no llega. */
export function segundoEn(curva: PuntoCurva[], pct: number): number | null {
  for (let i = 1; i < curva.length; i++) {
    const a = curva[i - 1], b = curva[i];
    if (b.progreso >= pct) return b.progreso === a.progreso ? b.t : r1(a.t + ((pct - a.progreso) * (b.t - a.t)) / (b.progreso - a.progreso));
  }
  return null;
}

/** El kill (el primero) o, sin kill, el intento que más lejos llegó (a igual progreso, el de menos muertes). */
export function intentoReferencia(intentos: IntentoDato[]): IntentoDato | null {
  if (intentos.length < 2) return null;
  const kill = intentos.find((i) => i.matado);
  if (kill) return kill;
  return [...intentos].sort((a, b) => b.progreso_pct - a.progreso_pct || (a.muertes ?? 0) - (b.muertes ?? 0) || a.intento - b.intento)[0];
}

/**
 * `muertes`: las de cada jugador (detalle.<jugador>.muertes); `grupo` fija qué jugadores cuentan (meta.grupo).
 * Devuelve null con menos de dos intentos o sin curva.
 */
export function compararIntentos(intentos: IntentoDato[], curva: PuntoCurva[], muertes: Record<string, MuerteDato[]>, grupo: string[]): ComparacionIntentos | null {
  const ref = intentoReferencia(intentos);
  if (!ref || !curva.length) return null;
  const curvaDe = new Map<number, PuntoCurva[]>();
  for (const p of curva) { const l = curvaDe.get(p.intento) ?? []; l.push(p); curvaDe.set(p.intento, l); }
  for (const l of curvaDe.values()) l.sort((a, b) => a.t - b.t || a.progreso - b.progreso);
  const todas = Object.entries(muertes).filter(([j]) => grupo.includes(j))
    .flatMap(([jugador, l]) => l.map((m) => ({ jugador, intento: m.intento, t: m.t, habilidad: m.habilidad })));
  const muertesDe = (intento: number) => todas.filter((m) => m.intento === intento).sort((a, b) => a.t - b.t || (a.jugador < b.jugador ? -1 : 1));
  const hasta = (l: typeof todas, s: number) => l.filter((m) => m.t <= s);
  const cRef = curvaDe.get(ref.intento) ?? [], mRef = muertesDe(ref.intento);

  const punto = (c: PuntoCurva[], m: typeof todas, pct: number): Punto | null => {
    const s = segundoEn(c, pct), sRef = segundoEn(cRef, pct);
    return s === null || sRef === null ? null : { pct, s, sRef, muertes: hasta(m, s).length, muertesRef: hasta(mRef, sRef).length };
  };
  const porHab = (l: typeof todas) => { const r = new Map<string, number>(); for (const m of l) if (m.habilidad) r.set(m.habilidad, (r.get(m.habilidad) ?? 0) + 1); return r; };

  const filas: FilaIntento[] = intentos.filter((i) => i.intento !== ref.intento).sort((a, b) => a.intento - b.intento).map((i) => {
    const base = {
      intento: i.intento, progreso: i.progreso_pct, duracion: i.duracion_s, muertes: i.muertes, rotura: i.rotura_s,
      ultimaCausa: i.ultima_causa || null,
    };
    const c = curvaDe.get(i.intento) ?? [], m = muertesDe(i.intento);
    // Hitos de los dos: múltiplos de 5 por debajo del progreso final del intento (el último punto de la curva es el final)
    const tope = Math.min(i.progreso_pct, ref.progreso_pct);
    const puntos: Punto[] = [];
    for (let pct = PASO; pct < tope || (pct === tope && i.matado); pct += PASO) { const p = punto(c, m, pct); if (p) puntos.push(p); }
    if (i.progreso_pct < MIN_PCT || !puntos.length) return { ...base, corto: true, separa: null, comun: null, caidas: [], causa: null, despues: null };

    let separa: FilaIntento['separa'] = null;
    for (const p of puntos) {
      const porMuertes = p.muertes - p.muertesRef >= MUERTES_DE_MAS;
      const porRitmo = p.s >= RITMO * p.sRef && p.s - p.sRef >= RITMO_S;
      if (porMuertes || porRitmo) { separa = { ...p, motivo: porMuertes && porRitmo ? 'ambos' : porMuertes ? 'muertes' : 'ritmo' }; break; }
    }
    const comun = puntos[puntos.length - 1];
    const corte = separa ?? comun;
    const antes = hasta(m, corte.s), antesRef = hasta(mRef, corte.sRef);

    const vistos = new Set<string>(), muertosRef = new Set(antesRef.map((x) => x.jugador));
    const caidas: FilaIntento['caidas'] = [];
    for (const x of antes) if (!vistos.has(x.jugador)) { vistos.add(x.jugador); if (!muertosRef.has(x.jugador)) caidas.push({ jugador: x.jugador, t: x.t, habilidad: x.habilidad }); }

    const hI = porHab(antes), hR = porHab(antesRef);
    let causa: FilaIntento['causa'] = null;
    for (const [habilidad, n] of hI) {
      const r = hR.get(habilidad) ?? 0;
      if (n - r >= CAUSA_DE_MAS && (!causa || n - r > causa.muertes - causa.ref || (n - r === causa.muertes - causa.ref && habilidad < causa.habilidad))) causa = { habilidad, muertes: n, ref: r };
    }

    const tras = m.filter((x) => x.t > comun.s);
    let top: [string, number] | null = null;
    for (const e of porHab(tras)) if (!top || e[1] > top[1] || (e[1] === top[1] && e[0] < top[0])) top = e;
    const despues = i.matado ? null : { s: Math.max(0, Math.round(i.duracion_s - comun.s)), muertes: tras.length, habilidad: top?.[0] ?? null, deEse: top?.[1] ?? 0 };

    return { ...base, corto: false, separa, comun, caidas, causa, despues };
  });

  // Tabla cada 10 %: segundos y muertes acumuladas al llegar, marcando lo claramente peor que la referencia
  const max = Math.max(...intentos.map((i) => i.progreso_pct));
  const hitos: number[] = [];
  for (let pct = 10; pct < max || (pct === max && intentos.some((i) => i.matado && i.progreso_pct === pct)); pct += 10) hitos.push(pct);
  const celdas = (i: IntentoDato) => hitos.map((pct) => {
    if (pct > i.progreso_pct || (pct === i.progreso_pct && !i.matado)) return null;
    const c = curvaDe.get(i.intento) ?? [];
    const s = segundoEn(c, pct);
    if (s === null) return null;
    const n = hasta(muertesDe(i.intento), s).length;
    if (i.intento === ref.intento) return { s, muertes: n, lento: false, muchas: false };
    const p = punto(c, muertesDe(i.intento), pct);
    return { s, muertes: n, lento: !!p && p.s >= RITMO * p.sRef && p.s - p.sRef >= RITMO_S, muchas: !!p && p.muertes - p.muertesRef >= MUERTES_DE_MAS };
  });
  const tabla = [ref, ...intentos.filter((i) => i.intento !== ref.intento).sort((a, b) => a.intento - b.intento)]
    .filter((i) => i.intento === ref.intento || i.progreso_pct >= MIN_PCT).map((i) => ({ intento: i.intento, celdas: celdas(i) }));

  const comparables = filas.filter((f) => !f.corto);
  const cuentas = {
    muertes: comparables.filter((f) => f.separa?.motivo === 'muertes').length,
    ritmo: comparables.filter((f) => f.separa?.motivo === 'ritmo').length,
    ambos: comparables.filter((f) => f.separa?.motivo === 'ambos').length,
    ninguno: comparables.filter((f) => !f.separa).length,
    comparables: comparables.length,
  };
  const porJugador = new Map<string, number[]>();
  for (const f of comparables) for (const x of f.caidas) porJugador.set(x.jugador, [...(porJugador.get(x.jugador) ?? []), f.intento]);
  const jugadores = [...porJugador].map(([jugador, l]) => ({ jugador, intentos: l }))
    .sort((a, b) => b.intentos.length - a.intentos.length || (a.jugador < b.jugador ? -1 : 1));

  return {
    referencia: { intento: ref.intento, matado: ref.matado, progreso: ref.progreso_pct, duracion: ref.duracion_s, muertes: ref.muertes, rotura: ref.rotura_s },
    intentos: filas, hitos, tabla, cuentas, jugadores,
  };
}

/** Versión compacta para la IA (lib/analisis/resumen.ts): las comparaciones ya hechas, en palabras. */
export function intentosParaIA(c: ComparacionIntentos) {
  const motivo = { muertes: 'más muertes', ritmo: 'menos daño (más lento)', ambos: 'más muertes y más lento' } as const;
  const comparables = c.intentos.filter((f) => !f.corto);
  return {
    referencia: { intento: c.referencia.intento, es: c.referencia.matado ? 'el kill' : 'el intento que más lejos llegó', progreso_pct: c.referencia.progreso, duracion_s: c.referencia.duracion, muertes: c.referencia.muertes },
    resumen: {
      intentos_comparados: c.cuentas.comparables,
      se_separan_por_muertes: c.cuentas.muertes + c.cuentas.ambos,
      se_separan_por_ritmo: c.cuentas.ritmo + c.cuentas.ambos,
      no_se_separan_y_caen_despues: c.cuentas.ninguno,
    },
    por_intento: comparables.map((f) => {
      const p = f.separa ?? f.comun!;
      return {
        intento: f.intento, progreso_pct: f.progreso,
        ...(f.separa ? { se_separa_al_pct: f.separa.pct, por: motivo[f.separa.motivo] } : { se_separa_al_pct: null, por: `iba como la referencia hasta el ${p.pct} %` }),
        en_ese_punto: { segundos: p.s, segundos_referencia: p.sRef, muertes: p.muertes, muertes_referencia: p.muertesRef },
        murieron_antes_que_en_la_referencia: f.caidas.map((x) => ({ jugador: x.jugador, segundo: x.t, habilidad: x.habilidad })),
        ...(f.causa ? { ataque_que_mas_mata_de_mas: { habilidad: f.causa.habilidad, muertes: f.causa.muertes, en_la_referencia: f.causa.ref } } : {}),
        ...(f.despues ? { despues_del_ultimo_hito_comun: { segundos: f.despues.s, muertes: f.despues.muertes, habilidad: f.despues.habilidad, muertes_de_esa: f.despues.deEse } } : {}),
      };
    }),
    pulls_por_debajo_del_5_pct: c.intentos.filter((f) => f.corto).map((f) => ({ intento: f.intento, duracion_s: f.duracion, muertes: f.muertes, ultima_causa: f.ultimaCausa })),
    jugadores_que_caen_antes_que_en_la_referencia: c.jugadores.map((j) => ({ jugador: j.jugador, intentos: `${j.intentos.length} de ${c.cuentas.comparables}` })),
  };
}
