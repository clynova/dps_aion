import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analizarJefe, cuantil, disparador, progresoEn, type IntentoJefe, type RaidJefe } from '@/lib/raids/jefe';

const intento = (n: number, progreso_pct: number, duracion_s: number, ultima_causa = '1800010', matado = false): IntentoJefe =>
  ({ intento: n, duracion_s, progreso_pct, matado, muertes: 5, ultima_causa });
// Curva lineal: `k` segundos por cada 1 % hasta el final del intento (cada intento va a un ritmo distinto)
const curva = (n: number, fin: number, k = 2) => [{ intento: n, t: 0, progreso: 0 }, { intento: n, t: fin * k, progreso: fin }];
// En cada intento: 1800100 a los 10 s (por tiempo); 1800200 al 20 % (en un segundo distinto según el ritmo, por
// vida), que se repite cada 30 s; 1800300 a deshora (ni una cosa ni otra).
const casteos = (n: number, fin: number, k: number, raro: number) => [
  { intento: n, t: 10, habilidad: '1800100' },
  ...[20 * k, 20 * k + 30, 20 * k + 60].filter((t) => t < fin * k).map((t) => ({ intento: n, t, habilidad: '1800200' })),
  { intento: n, t: raro, habilidad: '1800300' },
];
const raid = (slug: string, fecha: string, its: IntentoJefe[], causas: RaidJefe['datos']['causas'], ritmos: number[], raros: number[]): RaidJefe => ({
  slug, fecha,
  datos: {
    resumen: { dps_grupo_medio: 100_000, muertes_grupo: its.length * 5, kill_s: its.find((i) => i.matado)?.duracion_s ?? null },
    intentos: its,
    curva: its.flatMap((i, x) => curva(i.intento, i.matado ? 100 : i.progreso_pct, ritmos[x])),
    casteos: its.flatMap((i, x) => casteos(i.intento, i.matado ? 100 : i.progreso_pct, ritmos[x], raros[x])),
    causas,
  },
});

// Noche 1: 3 intentos (uno es un pull del 2 %); noche 2 (anterior en fecha aunque llegue después): kill en el 3.
const n1 = raid('noche-1', '2026-11-08T21:00:00-03:00',
  [intento(1, 2, 8), intento(2, 47, 100, '1800020'), intento(3, 52, 110, '1800020')],
  [{ habilidad: '1800020', muertes: 6 }, { habilidad: '1800030', muertes: 3 }], [4, 1.5, 3], [5, 15, 60]);
const n2 = raid('noche-2', '2026-11-07T21:00:00-03:00',
  [intento(1, 46, 95, '1800030'), intento(2, 33, 70, '1800020'), intento(3, 100, 200, '', true)],
  [{ habilidad: '1800020', muertes: 2 }], [2, 2.5, 2], [25, 80, 120]);

describe('página del jefe', () => {
  const a = analizarJefe([n1, n2]);

  it('cuantiles, progreso en un segundo y disparador', () => {
    expect(cuantil([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(cuantil([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(progresoEn(curva(1, 50), 30)).toBe(15);
    expect(progresoEn(curva(1, 50, 3), 30)).toBe(10);
    expect(progresoEn(curva(1, 50), 500)).toBe(50);
    expect(disparador([10, 10.5, 10, 11], [3, 5, 2, 8])).toBe('tiempo');
    expect(disparador([30, 45, 60, 52], [20, 20.4, 19.8, 20.1])).toBe('vida');
    expect(disparador([30, 45, 60], [10, 18, 25])).toBeNull();
    expect(disparador([10, 10], [3, 3])).toBeNull();                 // menos de 3 intentos
    expect(disparador([0, 0.1, 0], [0, 0, 0])).toBe('tiempo');       // al empezar el combate
  });

  it('noches en orden de fecha, con kill, mediana y muertes por intento', () => {
    expect(a.noches.map((n) => n.slug)).toEqual(['noche-2', 'noche-1']);
    expect(a.noches[0]).toMatchObject({ intentos: 3, matado: true, killS: 200, mejor: 100, mediana: 46, muertesPorIntento: 5, dpsGrupo: 100_000 });
    expect(a.noches[1]).toMatchObject({ intentos: 3, matado: false, killS: null, mejor: 52, mediana: 49.5 });
    expect(a.noches[1].progresos).toEqual([{ intento: 1, pct: 2, matado: false }, { intento: 2, pct: 47, matado: false }, { intento: 3, pct: 52, matado: false }]);
  });

  it('totales: el mejor y el primer kill', () => {
    expect(a.totales).toEqual({
      noches: 2, intentos: 6, comparables: 5, pulls: 1,
      mejor: { pct: 100, slug: 'noche-2', fecha: n2.fecha }, kill: { slug: 'noche-2', fecha: n2.fecha, killS: 200 },
    });
  });

  it('muro: wipes por tramo de 5 %, sin pulls ni kills, con huecos a cero', () => {
    expect(a.muro).toEqual([
      { desde: 30, wipes: 1, cierre: { habilidad: '1800020', veces: 1 } },
      { desde: 35, wipes: 0, cierre: null },
      { desde: 40, wipes: 0, cierre: null },
      { desde: 45, wipes: 2, cierre: { habilidad: '1800020', veces: 1 } },    // empate con 1800030: el id menor
      { desde: 50, wipes: 1, cierre: { habilidad: '1800020', veces: 1 } },
    ]);
  });

  it('cronograma: por tiempo, por vida y con repetición; el pull no cuenta', () => {
    const de = (h: string) => a.cronograma.find((c) => c.habilidad === h)!;
    expect(de('1800100')).toMatchObject({ intentos: 5, posibles: 5, veces: 5, primeroS: 10, primeroPct: 5, disparador: 'tiempo', cadaS: null });
    expect(de('1800200')).toMatchObject({ intentos: 5, primeroS: 40, primeroPct: 20, disparador: 'vida', cadaS: 30 });
    expect(de('1800300').disparador).toBeNull();
    expect(a.cronograma.map((c) => c.habilidad)).toEqual(['1800100', '1800200', '1800300']);
  });

  it('causas: las que más matan, por intento de cada noche', () => {
    expect(a.causas).toEqual([
      { habilidad: '1800020', total: 8, porNoche: [0.7, 2] },
      { habilidad: '1800030', total: 3, porNoche: [null, 1] },
    ]);
  });

  it('sin raids no hay nada que mostrar', () => {
    const v = analizarJefe([]);
    expect(v.noches).toEqual([]);
    expect(v.totales.mejor).toBeNull();
    expect(v.muro).toEqual([]);
  });

  it('funciona con una raid antigua (formato v1)', () => {
    const r = JSON.parse(readFileSync('tests/fixtures/raid-v1-anonima.json', 'utf8'));
    const v = analizarJefe([{ slug: r.meta.slug, fecha: r.meta.fecha, datos: r }]);
    expect(v.totales.mejor?.pct).toBe(r.resumen.mejor_pct);
    expect(v.muro.reduce((s, m) => s + m.wipes, 0)).toBe(r.intentos.filter((i: IntentoJefe) => i.progreso_pct >= 5).length);
    expect(v.cronograma.length).toBeGreaterThan(0);
  });
});

describe('cronograma: cuenta sobre los intentos que llegaron hasta el ataque', () => {
  it('un ataque del 60 % sale en 2 de los 2 intentos que llegaron, no en 2 de 4', () => {
    const its = [intento(1, 30, 60), intento(2, 70, 140), intento(3, 65, 130), intento(4, 20, 40)];
    const r = raid('n', '2026-11-08T21:00:00-03:00', its, [], [2, 2, 2, 2], [1, 1, 1, 1]);
    r.datos.casteos!.push({ intento: 2, t: 120, habilidad: '1800900' }, { intento: 3, t: 121, habilidad: '1800900' });
    const c = analizarJefe([r]).cronograma.find((x) => x.habilidad === '1800900')!;
    expect(c).toMatchObject({ intentos: 2, posibles: 2, primeroPct: 60.3 });
  });
});
