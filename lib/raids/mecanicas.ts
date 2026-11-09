// Fallos de mecánica por jugador, a partir de «mecanicas» del data.json (db/raid.sql): de cada ataque, en cuántas de
// sus salidas («olas») le dio a cada jugador de las que le pillaron vivo. Puro (sin base ni red): se prueba en
// tests/unit/mecanicas.test.ts. Todo lo que sale de aquí es una DEDUCCIÓN de los datos, no una regla del juego: el
// registro no dice qué ataques se pueden esquivar. La idea: si un ataque no da a todo el grupo y a alguien le da
// bastante más que a sus compañeros, probablemente se puede evitar (o esa persona juega más expuesta, p. ej. cuerpo a cuerpo).

export type MecanicaDato = {
  habilidad: string; golpes: number; olas: number; alcance: number;
  jugadores: { jugador: string; golpes: number; olas: number; expuesto: number; dano: number; golpe_max: number }[];
};

/**
 * todos = da a (casi) todos los vivos cada vez; objetivo = casi siempre al mismo jugador (el tanque u otro objetivo
 * fijo); selectivo = da solo a algunos, y no siempre a los mismos; escaso = salió muy pocas veces para decir nada.
 */
export type ClaseAtaque = 'todos' | 'objetivo' | 'selectivo' | 'escaso';
export type Nivel = 'alto' | 'bajo' | null;

export type Celda = {
  jugador: string; olas: number; expuesto: number; golpes: number; dano: number; golpe_max: number;
  /** olas / expuesto (null si no estuvo vivo en ninguna salida) */
  tasa: number | null;
  /** Las veces que le habría dado si le diera con la frecuencia que al resto (sin contarle a él ni al objetivo fijo) */
  esperado: number;
  /** alto = le da bastante más que al resto; bajo = bastante menos. Solo en ataques selectivos o de objetivo fijo. */
  nivel: Nivel;
  /** Es el objetivo fijo del ataque (el tanque): no se le cuenta como fallo. */
  objetivo: boolean;
};

export type Ataque = {
  habilidad: string; clase: ClaseAtaque; olas: number; golpes: number;
  /** Jugadores distintos a los que da cada salida, de media */
  alcance: number;
  /** Jugadores vivos por salida, de media */
  vivos: number;
  /** Jugador que se lleva casi todos los golpes (clase objetivo) */
  objetivo: string | null;
  /** Muertes del grupo por este ataque (de causas) */
  muertes: number;
  /** Una por jugador del grupo, en el orden pedido (los que no estuvieron expuestos, con expuesto 0) */
  celdas: Celda[];
};

export type FilaJugador = {
  jugador: string;
  /** Veces que le dieron ataques que no van a todo el grupo (sin los que le tienen de objetivo fijo) */
  recibidos: number;
  esperados: number;
  /** recibidos / esperados; null con muy pocos datos (menos de 3 esperados) */
  indice: number | null;
  /** Ataques en los que destaca por arriba, de mayor a menor exceso, y por abajo */
  altos: string[]; bajos: string[];
  /** Muertes suyas por ataques que no van a todo el grupo */
  muertes: number;
};

export type AnalisisMecanicas = { ataques: Ataque[]; jugadores: FilaJugador[] };

// Umbrales (deducidos mirando las raids de Ludra y Rahu del 8/11/2026)
const MIN_OLAS = 3;          // salidas mínimas de un ataque para clasificarlo
const MIN_IMPACTOS = 4;      // y veces que dio a alguien
const COBERTURA_TODOS = 0.7; // da a 7 de cada 10 vivos o más: va a todo el grupo
const CUOTA_OBJETIVO = 0.6;  // un jugador se lleva 6 de cada 10 golpes...
const TASA_OBJETIVO = 0.6;   // ...y le da 6 de cada 10 veces que sale: es su objetivo fijo (al tanque le da casi siempre)
const Z = 2.5;               // desviaciones (binomial) respecto al resto para destacar a alguien
const RAZON_ALTO = 1.5;      // y al menos un 50 % más de lo esperado
const MIN_ALTO = 3;          // y 3 veces o más (2 si el ataque tiene objetivo fijo: ahí no debería darle nunca)

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Clasifica los ataques y compara a cada jugador con el resto. `grupo` fija el orden de las celdas (normalmente
 * meta.grupo); `causas` y `muertesDe` (detalle.<jugador>.muertes) añaden las muertes.
 */
export function analizarMecanicas(
  mecanicas: MecanicaDato[], grupo: string[],
  causas: { habilidad: string; muertes: number }[] = [],
  muertesDe: Record<string, { habilidad: string }[]> = {},
): AnalisisMecanicas {
  const muertesHab = new Map<string, number>();
  for (const c of causas) if (c.habilidad) muertesHab.set(c.habilidad, (muertesHab.get(c.habilidad) ?? 0) + c.muertes);

  const ataques: Ataque[] = mecanicas.map((m) => {
    const de = new Map(m.jugadores.map((j) => [j.jugador, j]));
    const impactos = m.jugadores.reduce((s, j) => s + j.olas, 0);
    const expuestos = m.jugadores.reduce((s, j) => s + j.expuesto, 0);
    const vivos = m.olas ? expuestos / m.olas : 0;
    const mayor = [...m.jugadores].sort((a, b) => b.olas - a.olas)[0];
    let clase: ClaseAtaque = 'selectivo';
    if (m.olas < MIN_OLAS || impactos < MIN_IMPACTOS) clase = 'escaso';
    else if (vivos > 0 && m.alcance / vivos >= COBERTURA_TODOS) clase = 'todos';
    else if (mayor && mayor.olas / impactos >= CUOTA_OBJETIVO && mayor.olas >= TASA_OBJETIVO * mayor.expuesto) clase = 'objetivo';
    const objetivo = clase === 'objetivo' ? mayor.jugador : null;
    const compara = clase === 'selectivo' || clase === 'objetivo';

    const celdas: Celda[] = grupo.map((nombre) => {
      const j = de.get(nombre);
      const base = { jugador: nombre, olas: j?.olas ?? 0, expuesto: j?.expuesto ?? 0, golpes: j?.golpes ?? 0, dano: j?.dano ?? 0, golpe_max: j?.golpe_max ?? 0 };
      const esObjetivo = nombre === objetivo;
      const tasa = base.expuesto ? base.olas / base.expuesto : null;
      if (!compara || esObjetivo || !base.expuesto) return { ...base, tasa, esperado: 0, nivel: null, objetivo: esObjetivo };
      // El resto: todos menos él y menos el objetivo fijo
      let o = 0, e = 0;
      for (const x of m.jugadores) if (x.jugador !== nombre && x.jugador !== objetivo) { o += x.olas; e += x.expuesto; }
      if (!e) return { ...base, tasa, esperado: 0, nivel: null, objetivo: false };
      const p = o / e, esperado = base.expuesto * p;
      const sd = Math.sqrt(Math.max(base.expuesto * p * (1 - p), 0.25));
      const z = (base.olas - esperado) / sd;
      let nivel: Nivel = null;
      if (z >= Z && base.olas >= (objetivo ? 2 : MIN_ALTO) && base.olas >= RAZON_ALTO * esperado) nivel = 'alto';
      else if (z <= -Z && esperado >= 3 && base.olas <= esperado / 2) nivel = 'bajo';
      return { ...base, tasa, esperado, nivel, objetivo: false };
    });
    return { habilidad: m.habilidad, clase, olas: m.olas, golpes: m.golpes, alcance: m.alcance, vivos: r1(vivos), objetivo, muertes: muertesHab.get(m.habilidad) ?? 0, celdas };
  });

  const comparables = ataques.filter((a) => a.clase === 'selectivo' || a.clase === 'objetivo');
  const jugadores: FilaJugador[] = grupo.map((nombre) => {
    let recibidos = 0, esperados = 0;
    const altos: [string, number][] = [], bajos: string[] = [];
    const suyas = new Set<string>();
    for (const a of comparables) {
      const c = a.celdas.find((x) => x.jugador === nombre);
      if (!c || c.objetivo || !c.expuesto) continue;
      suyas.add(a.habilidad);
      recibidos += c.olas; esperados += c.esperado;
      if (c.nivel === 'alto') altos.push([a.habilidad, c.olas - c.esperado]);
      else if (c.nivel === 'bajo') bajos.push(a.habilidad);
    }
    return {
      jugador: nombre, recibidos, esperados: r1(esperados), indice: esperados >= 3 ? recibidos / esperados : null,
      altos: altos.sort((x, y) => y[1] - x[1]).map((x) => x[0]), bajos,
      muertes: (muertesDe[nombre] ?? []).filter((m) => suyas.has(m.habilidad)).length,
    };
  }).sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1) || b.recibidos - a.recibidos);

  return { ataques, jugadores };
}

/** Versión compacta para la IA (lib/analisis/resumen.ts): solo lo que destaca, ya calculado. */
export function fallosParaIA(a: AnalisisMecanicas) {
  const pct = (x: number | null) => (x === null ? null : Math.round((x - 1) * 100));
  return {
    por_jugador: a.jugadores.map((j) => ({
      jugador: j.jugador, golpes_recibidos: j.recibidos, golpes_esperados: j.esperados, diferencia_pct: pct(j.indice),
      muertes_por_estos_ataques: j.muertes, ataques_donde_recibe_de_mas: j.altos, ataques_que_esquiva_mejor: j.bajos,
    })),
    ataques: a.ataques.filter((x) => x.clase !== 'escaso').map((x) => ({
      habilidad: x.habilidad, tipo: x.clase === 'todos' ? 'da a todo el grupo' : x.clase === 'objetivo' ? 'objetivo fijo' : 'da solo a algunos',
      ...(x.objetivo ? { objetivo: x.objetivo } : {}), veces: x.olas, jugadores_por_vez: x.alcance, muertes: x.muertes,
      ...(x.clase === 'todos' ? {} : { de_mas: x.celdas.filter((c) => c.nivel === 'alto').map((c) => `${c.jugador} ${c.olas}/${c.expuesto}`) }),
    })),
  };
}
