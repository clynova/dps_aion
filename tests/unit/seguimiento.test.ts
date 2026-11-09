import { describe, expect, it } from 'vitest';
import type { MecanicaDato } from '@/lib/raids/mecanicas';
import { idsEnTexto, medir, seguimientoParaIA, seguir, type RaidSeg } from '@/lib/raids/seguimiento';

const grupo = ['Jugador1', 'Jugador2', 'Jugador3'];
const mec = (habilidad: string, olas: number, celdas: [number, number][]): MecanicaDato => ({
  habilidad, olas, golpes: celdas.reduce((s, c) => s + c[0], 0), alcance: 1,
  jugadores: celdas.map(([o, e], i) => ({ jugador: grupo[i], golpes: o, olas: o, expuesto: e, dano: o * 1000, golpe_max: 1000 })),
});
/** Una raid mínima: intentos, muertes de cada jugador por ataque y, si se pide, las mecánicas */
function raid(o: { fecha: string; intentos: number; matado?: boolean; mejor: number; dps: number[]; muertes: Record<string, string[]>; mecanicas?: MecanicaDato[]; jugadores?: string[] }): RaidSeg {
  const nombres = o.jugadores ?? grupo;
  const todas = Object.values(o.muertes).flat();
  return {
    meta: { fecha: o.fecha, grupo: nombres },
    resumen: { intentos: o.intentos, matado: !!o.matado, mejor_pct: o.mejor, muertes_grupo: todas.length, dps_grupo_medio: o.dps.reduce((s, x) => s + x, 0) },
    jugadores: nombres.map((n, i) => ({ jugador: n, dps: o.dps[i], muertes: (o.muertes[n] ?? []).length })),
    dps_intento: nombres.flatMap((n) => Array.from({ length: o.intentos }, (_, i) => ({ intento: i + 1, jugador: n }))),
    causas: [...new Set(todas)].map((h) => ({ habilidad: h, muertes: todas.filter((x) => x === h).length })),
    detalle: Object.fromEntries(nombres.map((n) => [n, { muertes: (o.muertes[n] ?? []).map((h) => ({ habilidad: h })), recibido: [{ habilidad: '1800100' }] }])),
    ...(o.mecanicas ? { mecanicas: o.mecanicas } : {}),
  };
}

const antes = raid({
  fecha: '2026-11-01T21:00:00-03:00', intentos: 10, mejor: 60, dps: [50000, 40000, 30000],
  muertes: { Jugador1: ['1800300', '1800300', '1800300', '1800300'], Jugador2: ['1800300', '1800300', '1800400'], Jugador3: ['1800400'] },
  mecanicas: [mec('1800300', 20, [[12, 20], [10, 20], [2, 20]]), mec('1800400', 10, [[5, 10], [5, 10], [5, 10]])],
});
const ahora = raid({
  fecha: '2026-11-08T21:00:00-03:00', intentos: 10, mejor: 80, dps: [56000, 40500, 20000],
  muertes: { Jugador1: ['1800300'], Jugador2: ['1800400'], Jugador3: ['1800400', '1800500', '1800500'] },
  mecanicas: [mec('1800300', 20, [[4, 20], [3, 20], [2, 20]]), mec('1800400', 10, [[5, 10], [5, 10], [5, 10]]), mec('1800500', 6, [[0, 6], [0, 6], [4, 6]])],
});
const analisis = {
  pendiente: false,
  recomendaciones: [
    { titulo: 'Salir de 1800300.', texto: 'Mata a 6; 14110340 (habilidad de jugador) y 123456789 no cuentan.' },
    { titulo: 'Aguantar 1800400', texto: 'Dos muertes.' },
    { titulo: 'Guardar defensivas.', texto: 'Sin ataque que medir.' },
    { titulo: 'Cuidado con 1800900 y 1800500', texto: '1800900 no dejó rastro en ninguna de las dos raids.' },
  ],
  jugadores: { Jugador1: ['Sal antes de 1800300: te mata 4 veces.'], Jugador3: ['Sube tu DPS.'] },
};

describe('seguimiento de recomendaciones', () => {
  it('medir: mejor, igual o peor según el umbral y el sentido', () => {
    expect(medir(1, 0.5, true, 0.2).veredicto).toBe('mejor');
    expect(medir(1, 1.1, true, 0.2).veredicto).toBe('igual');
    expect(medir(1, 1.5, true, 0.2).veredicto).toBe('peor');
    expect(medir(100, 110, false, 0.05).veredicto).toBe('mejor');
    expect(medir(0, 0.1, true, 0.2, 0.15).veredicto).toBe('igual');  // por debajo del mínimo absoluto
    expect(medir(0, 0.3, true, 0.2, 0.15).veredicto).toBe('peor');
    expect(medir(null, 3, true, 0.2).veredicto).toBeNull();
  });

  it('saca los ids de un texto sin repetir', () => {
    expect(idsEnTexto('Evita 1800300, 1800300 y 14110340; 100000 de daño, 12345 no, 123456789 tampoco')).toEqual(['1800300', '14110340', '100000']);
  });

  const s = seguir(ahora, antes, analisis);

  it('compara las cifras del grupo por intento', () => {
    expect(s.anterior).toEqual({ fecha: '2026-11-01T21:00:00-03:00', intentos: 10, matado: false });
    expect(s.grupo.muertes).toEqual({ antes: 0.8, ahora: 0.5, veredicto: 'mejor' });
    expect(s.grupo.mejor_pct).toEqual({ antes: 60, ahora: 80, veredicto: 'mejor' });
    expect(s.grupo.dps.veredicto).toBe('igual');   // 120000 → 116500: menos de un 5 %
    expect(s.conTasas).toBe(true);
  });

  it('mide cada recomendación por los ataques que nombra', () => {
    const [salir, aguantar, defensivas, nuevo] = s.recomendaciones;
    // solo cuentan los ids que son ataques de alguna de las dos raids (ni habilidades de jugador ni cifras)
    expect(salir.ataques.map((a) => a.habilidad)).toEqual(['1800300']);
    expect(salir.ataques[0].muertes).toEqual({ antes: 0.6, ahora: 0.1, veredicto: 'mejor' });
    expect(salir.ataques[0].tasa).toEqual({ antes: 40, ahora: 15, veredicto: 'mejor' });
    expect(salir.veredicto).toBe('mejor');
    expect(aguantar.ataques[0].muertes).toEqual({ antes: 0.2, ahora: 0.2, veredicto: 'igual' });
    expect(aguantar.veredicto).toBe('igual');
    expect(defensivas).toEqual({ titulo: 'Guardar defensivas.', ataques: [], veredicto: null });
    // 1800900 no es un ataque de ninguna de las dos; 1800500 es nuevo: no hay con qué comparar
    expect(nuevo.ataques.map((a) => a.habilidad)).toEqual(['1800500']);
    expect(nuevo.ataques[0]).toMatchObject({ vistoAntes: false, vistoAhora: true, muertes: { antes: null, ahora: 0.2, veredicto: null } });
    expect(nuevo.veredicto).toBeNull();
  });

  it('compara a cada jugador consigo mismo, con los ataques de sus consejos', () => {
    const [j1, j2, j3] = s.jugadores;
    expect(j1).toMatchObject({ jugador: 'Jugador1', muertes: { antes: 0.4, ahora: 0.1, veredicto: 'mejor' }, dps: { antes: 50000, ahora: 56000, veredicto: 'mejor' } });
    expect(j1.ataques).toHaveLength(1);
    expect(j1.ataques[0]).toMatchObject({ habilidad: '1800300', muertes: { antes: 0.4, ahora: 0.1, veredicto: 'mejor' }, tasa: { antes: 60, ahora: 20, veredicto: 'mejor' } });
    expect(j2).toMatchObject({ muertes: { antes: 0.3, ahora: 0.1, veredicto: 'mejor' }, dps: { veredicto: 'igual' }, ataques: [] });
    expect(j3).toMatchObject({ muertes: { antes: 0.1, ahora: 0.3, veredicto: 'peor' }, dps: { veredicto: 'peor' }, ataques: [] });
  });

  it('sin análisis anterior o sin mecánicas sigue comparando lo que hay', () => {
    const viejo = { ...antes, mecanicas: undefined };
    const r = seguir(ahora, viejo, { pendiente: true });
    expect(r.recomendaciones).toEqual([]);
    expect(r.conTasas).toBe(false);
    expect(r.grupo.muertes.veredicto).toBe('mejor');
    const conRecos = seguir(ahora, viejo, analisis);
    expect(conRecos.recomendaciones[0].ataques[0].tasa).toEqual({ antes: null, ahora: null, veredicto: null });
    expect(conRecos.recomendaciones[0].veredicto).toBe('mejor');   // por las muertes
  });

  it('matar al jefe es mejor aunque el % no cambie, y solo salen los jugadores de las dos raids', () => {
    const kill = raid({ fecha: '2026-11-09T21:00:00-03:00', intentos: 4, matado: true, mejor: 100, dps: [1, 1], muertes: {}, jugadores: ['Jugador2', 'Jugador9'] });
    const casi = { ...antes, resumen: { ...antes.resumen, mejor_pct: 99 } };
    const r = seguir(kill, casi, null);
    expect(r.grupo.mejor_pct.veredicto).toBe('mejor');
    expect(r.jugadores.map((j) => j.jugador)).toEqual(['Jugador2']);
  });

  it('el resumen para la IA lleva [antes, ahora, resultado]', () => {
    const ia = seguimientoParaIA(s);
    expect(ia.grupo.muertes_por_intento).toEqual([0.8, 0.5, 'mejor']);
    expect(ia.recomendaciones_anteriores[0]).toEqual({ titulo: 'Salir de 1800300.', resultado: 'mejor', ataques: [{ habilidad: '1800300', muertes_por_intento: [0.6, 0.1, 'mejor'], veces_que_da_pct: [40, 15, 'mejor'] }] });
    expect(ia.recomendaciones_anteriores[2].resultado).toBe('sin medir');
    expect(ia.recomendaciones_anteriores[3].ataques[0]).toEqual({ habilidad: '1800500', nota: 'no aparecía en la raid anterior' });
    expect(ia.jugadores[0].ataques_de_sus_consejos).toHaveLength(1);
    expect(ia.jugadores[1]).not.toHaveProperty('ataques_de_sus_consejos');
  });
});
