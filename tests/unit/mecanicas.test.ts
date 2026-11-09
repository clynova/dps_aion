import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analizarMecanicas, fallosParaIA, type MecanicaDato } from '@/lib/raids/mecanicas';

const grupo = ['Jugador1', 'Jugador2', 'Jugador3', 'Jugador4', 'Jugador5'];
/** Un ataque con [olas, expuesto] de cada jugador del grupo, en orden */
const ataque = (habilidad: string, olas: number, celdas: [number, number][]): MecanicaDato => {
  const jugadores = celdas.map(([o, e], i) => ({ jugador: grupo[i], golpes: o, olas: o, expuesto: e, dano: o * 1000, golpe_max: o ? 1000 : 0 }));
  const impactos = celdas.reduce((s, c) => s + c[0], 0);
  return { habilidad, golpes: impactos, olas, alcance: Math.round((impactos / olas) * 10) / 10, jugadores };
};

describe('fallos de mecánica', () => {
  const mecanicas = [
    ataque('100', 12, [[12, 12], [11, 11], [12, 12], [12, 12], [10, 10]]),   // da a todos
    ataque('200', 20, [[20, 20], [0, 20], [1, 20], [0, 18], [0, 20]]),       // al tanque (Jugador1)
    ataque('300', 22, [[3, 22], [11, 22], [1, 22], [2, 22], [0, 22]]),       // selectivo: Jugador2 recibe de más
    ataque('400', 12, [[8, 12], [7, 12], [8, 12], [0, 12], [7, 12]]),        // selectivo: Jugador4 lo esquiva siempre
    ataque('500', 60, [[12, 60], [11, 55], [13, 60], [12, 58], [12, 60]]),   // objetivo al azar: nadie destaca
    ataque('600', 2, [[1, 2], [0, 2], [0, 2], [1, 2], [0, 2]]),              // dos salidas: pocos datos
    ataque('700', 10, [[10, 10], [3, 10], [0, 10], [0, 10], [0, 10]]),       // al tanque, y Jugador2 se lo come 3 veces
  ];
  const r = analizarMecanicas(mecanicas, grupo, [{ habilidad: '300', muertes: 4 }, { habilidad: '300', muertes: 1 }, { habilidad: '100', muertes: 2 }],
    { Jugador2: [{ habilidad: '300' }, { habilidad: '300' }, { habilidad: '100' }], Jugador1: [{ habilidad: '200' }] });
  const de = (h: string) => r.ataques.find((a) => a.habilidad === h)!;
  const celda = (h: string, j: string) => de(h).celdas.find((c) => c.jugador === j)!;

  it('clasifica cada ataque por a quién da', () => {
    expect(r.ataques.map((a) => a.clase)).toEqual(['todos', 'objetivo', 'selectivo', 'selectivo', 'selectivo', 'escaso', 'objetivo']);
    expect(de('200').objetivo).toBe('Jugador1');
    expect(de('100').objetivo).toBeNull();
    expect(de('300').muertes).toBe(5);
    expect(de('100').vivos).toBe(4.8);
  });

  it('destaca a quien recibe bastante más que el resto, y a quien bastante menos', () => {
    expect(celda('300', 'Jugador2').nivel).toBe('alto');
    expect(de('300').celdas.filter((c) => c.nivel).map((c) => c.jugador)).toEqual(['Jugador2']);
    expect(celda('400', 'Jugador4').nivel).toBe('bajo');
    expect(de('400').celdas.filter((c) => c.nivel === 'alto')).toEqual([]);
    // un ataque que elige objetivo al azar no señala a nadie, ni uno que da a todos
    expect(de('500').celdas.every((c) => c.nivel === null)).toBe(true);
    expect(de('100').celdas.every((c) => c.nivel === null)).toBe(true);
    expect(de('600').celdas.every((c) => c.nivel === null)).toBe(true);
  });

  it('al objetivo fijo no le cuenta el ataque, y a quien se mete en medio sí', () => {
    expect(celda('200', 'Jugador1')).toMatchObject({ objetivo: true, nivel: null });
    expect(celda('200', 'Jugador3').nivel).toBeNull();          // una vez de veinte no es un patrón
    expect(celda('700', 'Jugador2').nivel).toBe('alto');
    expect(celda('700', 'Jugador2').esperado).toBe(0);         // al resto (sin el tanque) no le dio nunca
  });

  it('resume por jugador: recibidos frente a esperados, sin los ataques que le tienen de objetivo', () => {
    expect(r.jugadores[0].jugador).toBe('Jugador2');
    expect(r.jugadores[0]).toMatchObject({ recibidos: 11 + 7 + 11 + 3, altos: ['300', '700'], bajos: [], muertes: 2 });
    expect(r.jugadores[0].indice).toBeGreaterThan(1.3);
    const j1 = r.jugadores.find((j) => j.jugador === 'Jugador1')!;
    expect(j1.recibidos).toBe(3 + 8 + 12);                       // sin 200 ni 700, que van a por él
    expect(j1.muertes).toBe(0);
    const j4 = r.jugadores.find((j) => j.jugador === 'Jugador4')!;
    expect(j4.bajos).toEqual(['400']);
    expect(j4.indice).toBeLessThan(0.8);
    expect(r.jugadores.map((j) => j.jugador).at(-1)).toBe('Jugador4');
  });

  it('con un jugador que no estuvo expuesto, su celda queda vacía y no cuenta', () => {
    const a = ataque('800', 10, [[5, 10], [1, 10], [1, 10], [2, 10], [0, 0]]);
    a.jugadores.pop();   // raid.sql no manda a quien no estuvo vivo en ninguna salida
    const x = analizarMecanicas([a], grupo);
    expect(x.ataques[0].celdas[4]).toMatchObject({ jugador: 'Jugador5', expuesto: 0, tasa: null, nivel: null });
    expect(x.ataques[0].celdas[0].nivel).toBe('alto');
    expect(x.jugadores.find((j) => j.jugador === 'Jugador5')).toMatchObject({ recibidos: 0, indice: null });
  });

  it('el resumen para la IA solo lleva lo que destaca', () => {
    const ia = fallosParaIA(r);
    expect(ia.por_jugador[0]).toMatchObject({ jugador: 'Jugador2', ataques_donde_recibe_de_mas: ['300', '700'], muertes_por_estos_ataques: 2 });
    expect(ia.por_jugador[0].diferencia_pct).toBeGreaterThan(30);
    expect(ia.ataques.map((a) => a.habilidad)).not.toContain('600');
    expect(ia.ataques.find((a) => a.habilidad === '300')).toMatchObject({ tipo: 'da solo a algunos', de_mas: ['Jugador2 11/22'], muertes: 5 });
    expect(ia.ataques.find((a) => a.habilidad === '200')).toMatchObject({ tipo: 'objetivo fijo', objetivo: 'Jugador1' });
  });

  it('acepta el bloque mecanicas del fixture anónimo', () => {
    const d = JSON.parse(readFileSync('tests/fixtures/raid-v2-anonima.json', 'utf8'));
    const x = analizarMecanicas(d.mecanicas, d.meta.grupo, d.causas);
    expect(x.ataques.length).toBe(d.mecanicas.length);
    expect(x.jugadores.map((j) => j.jugador).sort()).toEqual([...d.meta.grupo].sort());
  });
});
