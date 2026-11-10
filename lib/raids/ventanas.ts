// Ventanas de daño, a partir de «ventanas» del data.json (db/raid.sql): cuánto daño hace cada jugador mientras la
// barra de aturdimiento del jefe está rota (la ventana en la que el jefe no ataca y conviene gastar lo fuerte) frente
// al resto del combate, y qué debuffs mantiene sobre el jefe. Puro (sin base ni red): se prueba en
// tests/unit/ventanas.test.ts. El DPS es por segundo VIVO, así que morir mucho no lo baja; lo que sí se ve es en
// cuántas roturas estaba vivo. Destacar a alguien frente al grupo es una comparación con umbrales fijos.

export type VentanasDato = {
  roturas: { intento: number; desde: number; hasta: number }[];
  jugadores: { jugador: string; roturas: number; presentes: number; dano_rotura: number; s_rotura: number; dano_fuera: number; s_fuera: number }[];
  debuffs: { jugador: string; habilidad: string; activo_pct: number; rotura_pct: number | null }[];
};

export type Nivel = 'alto' | 'bajo' | null;
export type FilaVentana = {
  jugador: string;
  /** Roturas de sus intentos y en cuántas estaba vivo al empezar */
  roturas: number; presentes: number;
  /** Daño al jefe por segundo vivo dentro de las roturas y fuera (null sin tiempo suficiente) */
  dpsRotura: number | null; dpsFuera: number | null;
  /** dpsRotura / dpsFuera: cuánto sube su daño en la rotura */
  mult: number | null;
  /** % de su daño de esos intentos hecho en rotura */
  pctEnRotura: number | null;
  /** alto = su daño sube bastante más que el del grupo en la rotura; bajo = bastante menos */
  nivel: Nivel;
};
export type AnalisisVentanas = {
  /** Roturas, intentos en que hubo alguna y segundos que suman */
  roturas: number; intentos: number; segundos: number;
  /** Media del grupo por jugador y segundo vivo */
  grupo: { dpsRotura: number | null; dpsFuera: number | null; mult: number | null };
  jugadores: FilaVentana[];
  /** Debuffs sobre el jefe con un 10 % del tiempo o más, por jugador */
  debuffs: { jugador: string; lista: { habilidad: string; activo_pct: number; rotura_pct: number | null }[] }[];
};

// Umbrales
const MIN_S = 5;           // segundos vivo en rotura para calcular su DPS ahí
const MIN_S_FUERA = 30;    // y fuera
const ALTO = 1.2;          // su multiplicador es un 20 % mayor que el del grupo
const BAJO = 0.8;          // o un 20 % menor
const MIN_ROTURAS = 3;     // roturas mínimas en la raid para destacar a alguien (con una o dos manda el azar)
const MIN_DEBUFF = 10;     // % del tiempo para listar un debuff

const r1 = (x: number) => Math.round(x * 10) / 10;

/** `grupo` fija qué jugadores salen (normalmente meta.grupo). */
export function analizarVentanas(v: VentanasDato, grupo: string[]): AnalisisVentanas {
  const suyos = v.jugadores.filter((j) => grupo.includes(j.jugador));
  const suma = (f: (j: VentanasDato['jugadores'][number]) => number) => suyos.reduce((s, j) => s + f(j), 0);
  const sR = suma((j) => j.s_rotura), sF = suma((j) => j.s_fuera);
  const gR = sR >= MIN_S ? suma((j) => j.dano_rotura) / sR : null;
  const gF = sF >= MIN_S_FUERA ? suma((j) => j.dano_fuera) / sF : null;
  const gMult = gR !== null && gF ? gR / gF : null;

  const jugadores: FilaVentana[] = suyos.map((j) => {
    const dpsRotura = j.s_rotura >= MIN_S ? j.dano_rotura / j.s_rotura : null;
    const dpsFuera = j.s_fuera >= MIN_S_FUERA ? j.dano_fuera / j.s_fuera : null;
    const mult = dpsRotura !== null && dpsFuera ? dpsRotura / dpsFuera : null;
    const total = j.dano_rotura + j.dano_fuera;
    let nivel: Nivel = null;
    if (mult !== null && gMult && v.roturas.length >= MIN_ROTURAS) nivel = mult >= ALTO * gMult ? 'alto' : mult <= BAJO * gMult ? 'bajo' : null;
    return {
      jugador: j.jugador, roturas: j.roturas, presentes: j.presentes,
      dpsRotura: dpsRotura === null ? null : Math.round(dpsRotura), dpsFuera: dpsFuera === null ? null : Math.round(dpsFuera),
      mult, pctEnRotura: total ? r1((100 * j.dano_rotura) / total) : null, nivel,
    };
  }).sort((a, b) => (b.dpsRotura ?? -1) - (a.dpsRotura ?? -1) || (a.jugador < b.jugador ? -1 : 1));

  const porJugador = new Map<string, AnalisisVentanas['debuffs'][number]['lista']>();
  for (const d of v.debuffs) {
    if (!grupo.includes(d.jugador) || d.activo_pct < MIN_DEBUFF) continue;
    const l = porJugador.get(d.jugador) ?? [];
    l.push({ habilidad: d.habilidad, activo_pct: d.activo_pct, rotura_pct: d.rotura_pct });
    porJugador.set(d.jugador, l);
  }
  return {
    roturas: v.roturas.length, intentos: new Set(v.roturas.map((x) => x.intento)).size,
    segundos: r1(v.roturas.reduce((s, x) => s + (x.hasta - x.desde), 0)),
    grupo: { dpsRotura: gR === null ? null : Math.round(gR), dpsFuera: gF === null ? null : Math.round(gF), mult: gMult },
    jugadores,
    debuffs: grupo.filter((n) => porJugador.has(n)).map((n) => ({ jugador: n, lista: porJugador.get(n)!.sort((a, b) => b.activo_pct - a.activo_pct) })),
  };
}

/** Versión compacta para la IA (lib/analisis/resumen.ts): las cifras ya comparadas. */
export function ventanasParaIA(a: AnalisisVentanas) {
  const x2 = (m: number | null) => (m === null ? null : Math.round(m * 100) / 100);
  return {
    roturas_de_barra: a.roturas, intentos_con_rotura: a.intentos, segundos_de_rotura: a.segundos,
    grupo: { dps_por_jugador_en_rotura: a.grupo.dpsRotura, dps_por_jugador_fuera: a.grupo.dpsFuera, multiplicador: x2(a.grupo.mult) },
    por_jugador: a.jugadores.map((j) => ({
      jugador: j.jugador, roturas_vivo: `${j.presentes} de ${j.roturas}`, dps_en_rotura: j.dpsRotura, dps_fuera: j.dpsFuera,
      multiplicador: x2(j.mult), pct_de_su_dano_en_rotura: j.pctEnRotura,
      ...(j.nivel ? { frente_al_grupo: j.nivel === 'alto' ? 'aprovecha la rotura más que el grupo' : 'aprovecha la rotura menos que el grupo' } : {}),
    })),
    debuffs_sobre_el_jefe: a.debuffs.flatMap((d) => d.lista.map((x) => ({ jugador: d.jugador, habilidad: x.habilidad, activo_pct: x.activo_pct, en_rotura_pct: x.rotura_pct }))),
  };
}
