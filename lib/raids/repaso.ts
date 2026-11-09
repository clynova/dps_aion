// Repaso de cada muerte, a partir de «repaso» de detalle.<jugador>.muertes del data.json (db/raid.sql): los 10 s
// anteriores (vida, golpes, curación, escudos, compañeros vivos y defensivos). Puro (sin base ni red): se prueba en
// tests/unit/repaso.test.ts. La clasificación es una DEDUCCIÓN de los datos, con umbrales fijos: el registro no dice
// si una muerte se podía evitar. Sirve para separar lo que es de mecánica (un golpe que mata desde la vida alta: no
// hay curación que lo arregle) de lo que es de aguante (se fue apagando sin que llegara curación suficiente).

export type RepasoDato = {
  vida_10s: number; vida: [number, number][]; vida_max: number;
  golpes_10s: number; dano_10s: number;
  golpes: { t: number; hab: string; dano: number; mit: string | null }[];
  cura_10s: number; curas: { jugador: string; hab: string; cantidad: number; n: number }[];
  escudo_10s: number; companeros: number; vivos: number; sanadores: number;
  defensivos: { hab: string; hace_s: number | null; recarga_s: number | null }[];
};
export type MuerteDato = { intento: number; t: number; habilidad: string; origen?: string; golpe_max: number; repaso?: RepasoDato };

/**
 * golpe = un solo golpe se lo llevó: tenía la vida alta, o el golpe quita casi toda su vida máxima de una vez; rafaga = estaba bien 3 s antes y cayó con varios golpes
 * seguidos; desgaste = llevaba 3 s o más con la vida baja.
 */
export type TipoMuerte = 'golpe' | 'rafaga' | 'desgaste';

export type MuerteRepasada = {
  jugador: string; intento: number; t: number; habilidad: string; golpe_max: number; tipo: TipoMuerte;
  /** % de vida justo antes del golpe final y 3 s antes de morir */
  vidaAntes: number; vida3s: number;
  /** Vida de los 10 s: [segundos respecto a la muerte, %], desde -10 */
  curva: [number, number][];
  /** No quedaba ningún sanador vivo (clérigos y cantores, sin contarle a él) */
  sinSanador: boolean;
  /** Ya había caído más de la mitad de sus compañeros */
  grupoCaido: boolean;
  /** Defensivos que probablemente tenía disponibles (solo cuenta en ráfagas y desgastes) */
  libres: string[];
  repaso: RepasoDato;
};

export type Cuenta = { muertes: number; golpe: number; rafaga: number; desgaste: number; sinSanador: number; grupoCaido: number; conDefensivo: number };
export type FilaRepaso = Cuenta & { jugador: string };
export type IntentoRepaso = { intento: number; muertes: MuerteRepasada[] };
export type AnalisisRepaso = {
  /** Muertes de la raid y cuántas traen repaso (las de raids antiguas no) */
  total: number; conRepaso: number;
  grupo: Cuenta; jugadores: FilaRepaso[]; intentos: IntentoRepaso[];
};

// Umbrales (deducidos mirando las raids de Ludra y Rahu del 8/11/2026)
const VIDA_ALTA = 80;        // % de vida «alta» justo antes del golpe final; y un golpe que quita ese % de la vida máxima mata «de un golpe»
const VIDA_BIEN = 60;        // % de vida con el que se está «bien» 3 s antes
const FINAL_S = 1.5;         // ventana del golpe final
const CUOTA_GOLPE = 0.7;     // el mayor golpe de esa ventana hace 7 de cada 10 puntos de daño: es «un golpe»

const cero = (): Cuenta => ({ muertes: 0, golpe: 0, rafaga: 0, desgaste: 0, sinSanador: 0, grupoCaido: 0, conDefensivo: 0 });

/** Vida vigente en el segundo t (la última lectura hasta entonces) */
const vidaEn = (curva: [number, number][], t: number) => { let v = curva[0][1]; for (const [x, p] of curva) { if (x > t) break; v = p; } return v; };

export function repasarMuerte(jugador: string, m: MuerteDato & { repaso: RepasoDato }): MuerteRepasada {
  const r = m.repaso;
  // Lecturas repetidas fuera, y siempre un punto de partida en -10
  const curva: [number, number][] = [[-10, r.vida_10s]];
  for (const [t, p] of r.vida) { const u = curva[curva.length - 1]; if (u[1] !== p) curva.push([Math.max(t, -10), p]); }
  // Justo antes del golpe final: la última lectura con vida, sin contar las del final (ya muerto)
  const conVida = curva.filter(([, p]) => p > 0);
  const vidaAntes = conVida.length ? conVida[conVida.length - 1][1] : 0;
  const vida3s = vidaEn(curva, -3);
  const finales = r.golpes.filter((g) => g.t >= -FINAL_S);
  const danoFinal = finales.reduce((s, g) => s + g.dano, 0);
  const mayor = finales.reduce((s, g) => Math.max(s, g.dano), 0);
  let tipo: TipoMuerte = 'desgaste';
  if (r.vida_max > 0 && mayor >= (VIDA_ALTA / 100) * r.vida_max) tipo = 'golpe';   // mata también desde la vida alta
  else if (vidaAntes >= VIDA_ALTA && (danoFinal === 0 || mayor >= CUOTA_GOLPE * danoFinal)) tipo = 'golpe';
  else if (vidaAntes >= VIDA_ALTA || vida3s >= VIDA_BIEN) tipo = 'rafaga';
  const libres = tipo === 'golpe' ? [] : r.defensivos
    .filter((d) => d.recarga_s !== null && (d.hace_s === null || d.hace_s >= d.recarga_s)).map((d) => d.hab);
  return {
    jugador, intento: m.intento, t: m.t, habilidad: m.habilidad, golpe_max: m.golpe_max, tipo, vidaAntes, vida3s, curva,
    sinSanador: r.sanadores === 0, grupoCaido: r.vivos * 2 < r.companeros, libres, repaso: r,
  };
}

/** `grupo` fija qué jugadores salen (normalmente meta.grupo); `muertesDe` es detalle.<jugador>.muertes. */
export function analizarRepaso(muertesDe: Record<string, MuerteDato[]>, grupo: string[]): AnalisisRepaso {
  const total = grupo.reduce((s, n) => s + (muertesDe[n]?.length ?? 0), 0);
  const todas: MuerteRepasada[] = [];
  for (const n of grupo) for (const m of muertesDe[n] ?? []) if (m.repaso) todas.push(repasarMuerte(n, m as MuerteDato & { repaso: RepasoDato }));
  const sumar = (c: Cuenta, m: MuerteRepasada) => {
    c.muertes++; c[m.tipo]++;
    if (m.sinSanador) c.sinSanador++;
    if (m.grupoCaido) c.grupoCaido++;
    if (m.libres.length) c.conDefensivo++;
  };
  const total0 = cero();
  const porJugador = new Map<string, FilaRepaso>(grupo.map((n) => [n, { jugador: n, ...cero() }]));
  const porIntento = new Map<number, MuerteRepasada[]>();
  for (const m of todas) {
    sumar(total0, m); sumar(porJugador.get(m.jugador)!, m);
    const l = porIntento.get(m.intento); if (l) l.push(m); else porIntento.set(m.intento, [m]);
  }
  return {
    total, conRepaso: todas.length, grupo: total0,
    jugadores: [...porJugador.values()].filter((j) => j.muertes).sort((a, b) => b.muertes - a.muertes || (a.jugador < b.jugador ? -1 : 1)),
    // Dentro del intento, por segundo; en el mismo segundo, antes quien murió con más compañeros vivos
    intentos: [...porIntento].sort((a, b) => a[0] - b[0])
      .map(([intento, muertes]) => ({ intento, muertes: muertes.sort((a, b) => a.t - b.t || b.repaso.vivos - a.repaso.vivos) })),
  };
}

/** Versión compacta para la IA (lib/analisis/resumen.ts): las cuentas ya hechas y la primera muerte de cada intento. */
export function repasoParaIA(a: AnalisisRepaso) {
  const cuenta = (c: Cuenta) => ({
    muertes: c.muertes, de_un_golpe: c.golpe, en_rafaga: c.rafaga, por_desgaste: c.desgaste,
    sin_sanador_vivo: c.sinSanador, con_el_grupo_caido: c.grupoCaido, con_defensivo_sin_usar: c.conDefensivo,
  });
  const tipo = { golpe: 'de un golpe', rafaga: 'en ráfaga', desgaste: 'por desgaste' } as const;
  return {
    grupo: cuenta(a.grupo),
    por_jugador: a.jugadores.map((j) => ({ jugador: j.jugador, ...cuenta(j) })),
    primera_muerte_de_cada_intento: a.intentos.map((i) => {
      const m = i.muertes[0];
      return { intento: i.intento, jugador: m.jugador, segundo: m.t, habilidad: m.habilidad, tipo: tipo[m.tipo], vida_antes_pct: m.vidaAntes, curacion_recibida_10s: m.repaso.cura_10s };
    }),
  };
}
