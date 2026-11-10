import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resumenParaIA } from '@/lib/analisis/resumen';
import { compararIntentos, intentoReferencia, intentosParaIA, segundoEn, type IntentoDato, type MuerteDato, type PuntoCurva } from '@/lib/raids/intentos';

const grupo = ['Jugador1', 'Jugador2', 'Jugador3', 'Jugador4'];
const intento = (n: number, progreso_pct: number, duracion_s: number, muertes: number, matado = false): IntentoDato =>
  ({ intento: n, duracion_s, progreso_pct, matado, muertes, rotura_s: null, ultima_causa: '1800010' });
// Curva lineal: `s5` segundos por cada 5 %, hasta `fin` % en `dur` s (el último punto es el final del intento)
const curva = (n: number, s5: number, fin: number, dur: number): PuntoCurva[] => {
  const l: PuntoCurva[] = [{ intento: n, t: 0, progreso: 0 }];
  for (let p = 5; p < fin; p += 5) l.push({ intento: n, t: (p / 5) * s5, progreso: p });
  l.push({ intento: n, t: dur, progreso: fin });
  return l;
};
const m = (intento: number, t: number, habilidad = '1800010'): MuerteDato => ({ intento, t, habilidad });

// Intento 1: va al ritmo del 3 (10 s cada 5 %) pero pierde a 3 jugadores antes del 15 % (30 s) con 1800020.
// Intento 2: sin muertes de más, pero tarda 15 s cada 5 % (al 5 %, 15 s frente a 10: solo 5 s más → no;
//   al 10 %, 30 frente a 20 → sí).
// Intento 3: el mejor (40 %), 2 muertes antes del 30 %.
// Intento 4: iba igual que el 3 hasta el 30 % y cayó después (4 muertes por 1800030).
// Intento 5: un pull por debajo del 5 %.
const intentos = [intento(1, 22, 50, 6), intento(2, 18, 60, 4), intento(3, 40, 90, 6), intento(4, 33, 75, 7), intento(5, 1.2, 9, 4)];
const puntos = [...curva(1, 10, 22, 50), ...curva(2, 15, 18, 60), ...curva(3, 10, 40, 90), ...curva(4, 10, 33, 75), { intento: 5, t: 0, progreso: 0 }, { intento: 5, t: 9, progreso: 1.2 }];
const muertes: Record<string, MuerteDato[]> = {
  Jugador1: [m(1, 12, '1800020'), m(3, 55), m(4, 66, '1800030'), m(5, 5)],
  Jugador2: [m(1, 18, '1800020'), m(4, 68, '1800030'), m(5, 6)],
  Jugador3: [m(1, 25, '1800020'), m(2, 50), m(3, 80), m(4, 70, '1800030'), m(5, 7)],
  Jugador4: [m(1, 45), m(2, 55), m(3, 85), m(4, 72, '1800030'), m(5, 8)],
  Intruso: [m(1, 5), m(1, 6), m(1, 7)],
};

describe('intento contra el mejor intento', () => {
  const c = compararIntentos(intentos, puntos, muertes, grupo)!;
  const de = (n: number) => c.intentos.find((f) => f.intento === n)!;

  it('elige como referencia el kill o, sin kill, el que más lejos llegó', () => {
    expect(c.referencia).toMatchObject({ intento: 3, matado: false, progreso: 40 });
    expect(intentoReferencia([intento(1, 50, 100, 3), intento(2, 100, 200, 5, true), intento(3, 60, 110, 2)])?.intento).toBe(2);
    expect(intentoReferencia([intento(1, 50, 100, 3), intento(2, 50, 90, 2)])?.intento).toBe(2);   // empate: menos muertes
    expect(intentoReferencia([intento(1, 50, 100, 3)])).toBeNull();
  });

  it('interpola el segundo en que se llega a cada %', () => {
    expect(segundoEn(curva(3, 10, 40, 90), 15)).toBe(30);
    expect(segundoEn([{ intento: 1, t: 0, progreso: 0 }, { intento: 1, t: 20, progreso: 10 }], 2.5)).toBe(5);
    expect(segundoEn(curva(3, 10, 40, 90), 45)).toBeNull();
  });

  it('se separa por muertes cuando lleva 3 más a igual progreso (sin contar a quien no es del grupo)', () => {
    const f = de(1);
    expect(f.separa).toMatchObject({ pct: 15, motivo: 'muertes', s: 30, sRef: 30, muertes: 3, muertesRef: 0 });
    expect(f.caidas.map((x) => x.jugador)).toEqual(['Jugador1', 'Jugador2', 'Jugador3']);
    expect(f.causa).toEqual({ habilidad: '1800020', muertes: 3, ref: 0 });
  });

  it('se separa por ritmo cuando tarda un 15 % y 10 s más', () => {
    const f = de(2);
    expect(f.separa).toMatchObject({ pct: 10, motivo: 'ritmo', s: 30, sRef: 20, muertes: 0, muertesRef: 0 });
    expect(f.caidas).toEqual([]);
  });

  it('sin separarse, dice hasta dónde iba igual y qué pasó después', () => {
    const f = de(4);
    expect(f.separa).toBeNull();
    expect(f.comun).toMatchObject({ pct: 30, s: 60, sRef: 60, muertes: 0, muertesRef: 1 });
    expect(f.despues).toEqual({ s: 15, muertes: 4, habilidad: '1800030', deEse: 4 });
  });

  it('un pull por debajo del 5 % no se compara', () => {
    expect(de(5)).toMatchObject({ corto: true, separa: null, comun: null, caidas: [] });
    expect(c.cuentas).toEqual({ muertes: 1, ritmo: 1, ambos: 0, ninguno: 1, comparables: 3 });
  });

  it('cuenta quién cae antes que en la referencia', () => {
    expect(c.jugadores).toEqual([
      { jugador: 'Jugador1', intentos: [1] }, { jugador: 'Jugador2', intentos: [1] }, { jugador: 'Jugador3', intentos: [1] },
    ]);
  });

  it('tabla cada 10 %, con la referencia primero y sin los pulls', () => {
    expect(c.hitos).toEqual([10, 20, 30]);
    expect(c.tabla.map((x) => x.intento)).toEqual([3, 1, 2, 4]);
    expect(c.tabla[1].celdas).toEqual([
      { s: 20, muertes: 2, lento: false, muchas: false }, { s: 40, muertes: 3, lento: false, muchas: true }, null,
    ]);
    expect(c.tabla[2].celdas[0]).toEqual({ s: 30, muertes: 0, lento: true, muchas: false });
  });

  it('con un kill, la tabla llega al 100 %', () => {
    const k = compararIntentos([intento(1, 100, 80, 1, true), intento(2, 30, 40, 5)],
      [...curva(1, 4, 100, 80), ...curva(2, 4, 30, 40)], {}, grupo)!;
    expect(k.hitos.at(-1)).toBe(100);
    expect(k.tabla[0].celdas.at(-1)).toEqual({ s: 80, muertes: 0, lento: false, muchas: false });
    expect(k.intentos[0].comun?.pct).toBe(25);
  });

  it('resumen para la IA', () => {
    const ia = intentosParaIA(c);
    expect(ia.referencia).toEqual({ intento: 3, es: 'el intento que más lejos llegó', progreso_pct: 40, duracion_s: 90, muertes: 6 });
    expect(ia.resumen).toEqual({ intentos_comparados: 3, se_separan_por_muertes: 1, se_separan_por_ritmo: 1, no_se_separan_y_caen_despues: 1 });
    expect(ia.por_intento.find((x) => x.intento === 4)).toMatchObject({ se_separa_al_pct: null, por: 'iba como la referencia hasta el 30 %' });
    expect(ia.pulls_por_debajo_del_5_pct).toEqual([{ intento: 5, duracion_s: 9, muertes: 4, ultima_causa: '1800010' }]);
    expect(ia.jugadores_que_caen_antes_que_en_la_referencia[0]).toEqual({ jugador: 'Jugador1', intentos: '1 de 3' });
  });

  it('con un solo intento o sin curva no hay comparación', () => {
    expect(compararIntentos([intento(1, 50, 100, 3)], curva(1, 10, 50, 100), {}, grupo)).toBeNull();
    expect(compararIntentos(intentos, [], muertes, grupo)).toBeNull();
  });

  it('funciona con una raid antigua (formato v1) y va en lo que se manda a la IA', () => {
    const r = JSON.parse(readFileSync('tests/fixtures/raid-v1-anonima.json', 'utf8'));
    const x = compararIntentos(r.intentos, r.curva,
      Object.fromEntries(Object.entries(r.detalle as Record<string, { muertes: MuerteDato[] }>).map(([n, d]) => [n, d.muertes])), r.meta.grupo)!;
    expect(x.referencia.intento).toBe(r.resumen.mejor_intento);
    expect(x.intentos).toHaveLength(r.intentos.length - 1);
    expect(x.cuentas.comparables).toBe(r.intentos.filter((i: IntentoDato) => i.progreso_pct >= 5).length - 1);
    const res = resumenParaIA(r, { apodos: {}, habilidades: {}, npcs: {} }, []);
    expect(res.comparacion_con_el_mejor_intento?.referencia.intento).toBe(r.resumen.mejor_intento);
  });
});
