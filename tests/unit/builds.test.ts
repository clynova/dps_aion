import { describe, expect, it } from 'vitest';
import { analizarBuffs, buffsParaIA, type BuffDato } from '@/lib/raids/buffs';
import {
  analizarEspecializaciones, especializacionesDePerfil, especializacionesParaIA, formatoOpciones, tablaClase, type EspecializacionDato,
} from '@/lib/raids/especializaciones';

const e = (jugador: string, habilidad: string, opciones: string, usos = 10): EspecializacionDato => ({ jugador, habilidad, opciones, usos });
const jugadores = [
  { jugador: 'Jugador1', clase_id: 'cleric' }, { jugador: 'Jugador2', clase_id: 'cleric' }, { jugador: 'Jugador3', clase_id: 'cleric' },
  { jugador: 'Jugador4', clase_id: 'chanter' }, { jugador: 'Jugador5', clase_id: 'chanter' }, { jugador: 'Jugador6', clase_id: 'templar' },
];
const grupo = jugadores.map((j) => j.jugador);
const esp = [
  // Clérigos: 1800100 igual en los tres; 1800200 Jugador3 se aparta de la mayoría; 1800300 solo la usa Jugador1
  e('Jugador1', '1800100', '245', 100), e('Jugador2', '1800100', '245', 90), e('Jugador3', '1800100', '245', 80),
  e('Jugador1', '1800200', '12', 50), e('Jugador2', '1800200', '12', 40), e('Jugador3', '1800200', '23', 30),
  e('Jugador1', '1800300', '4', 5),
  // Cantores: dos opciones distintas, sin mayoría
  e('Jugador4', '1800400', '34'), e('Jugador5', '1800400', '45'),
  // Templario solo; y alguien de fuera del grupo
  e('Jugador6', '1800500', '1'), e('Intruso', '1800100', '9'),
];

describe('especializaciones', () => {
  const t = analizarEspecializaciones(esp, jugadores, grupo);
  const clase = (c: string) => t.find((x) => x.clase === c)!;

  it('formato de las opciones', () => {
    expect(formatoOpciones('245')).toBe('2·4·5');
    expect(formatoOpciones('3', ', ')).toBe('3');
  });

  it('una tabla por clase, las de más jugadores primero, sin quien no es del grupo', () => {
    expect(t.map((x) => x.clase)).toEqual(['cleric', 'chanter', 'templar']);
    expect(clase('cleric').jugadores).toEqual(['Jugador1', 'Jugador2', 'Jugador3']);
  });

  it('marca quién se aparta de la mayoría; sin mayoría, la fila es variada', () => {
    const c = clase('cleric');
    expect(c.filas.map((f) => f.habilidad)).toEqual(['1800100', '1800200', '1800300']);   // por usos
    expect(c.filas[0]).toEqual({ habilidad: '1800100', opciones: ['245', '245', '245'], estado: ['igual', 'igual', 'igual'] });
    expect(c.filas[1].estado).toEqual(['igual', 'igual', 'distinta']);
    expect(c.filas[2]).toEqual({ habilidad: '1800300', opciones: ['4', null, null], estado: [null, null, null] });
    expect(c.distintas).toBe(1);
    expect(clase('chanter').filas[0].estado).toEqual(['variada', 'variada']);
    expect(clase('templar').filas[0].estado).toEqual([null]);
  });

  it('con mayoría de dos contra dos no hay mayoría', () => {
    const x = tablaClase('cleric', [
      { jugador: 'A', opciones: { h: '12' }, usos: { h: 1 } }, { jugador: 'B', opciones: { h: '12' }, usos: { h: 1 } },
      { jugador: 'C', opciones: { h: '23' }, usos: { h: 1 } }, { jugador: 'D', opciones: { h: '23' }, usos: { h: 1 } },
    ]);
    expect(x.filas[0].estado).toEqual(['variada', 'variada', 'variada', 'variada']);
  });

  it('para la IA, solo lo que se aparta, con las opciones de los demás', () => {
    // En el orden de las tablas (clérigos, cantores); el templario va solo y no se compara
    expect(especializacionesParaIA(t)).toEqual([
      { jugador: 'Jugador3', clase: 'cleric', habilidad: '1800200', sus_opciones: '2, 3', los_demas_de_su_clase: ['Jugador1: 1, 2', 'Jugador2: 1, 2'] },
      { jugador: 'Jugador4', clase: 'chanter', habilidad: '1800400', sus_opciones: '3, 4', los_demas_de_su_clase: ['Jugador5: 4, 5'] },
      { jugador: 'Jugador5', clase: 'chanter', habilidad: '1800400', sus_opciones: '4, 5', los_demas_de_su_clase: ['Jugador4: 3, 4'] },
    ]);
  });

  it('en el perfil: su raid más reciente frente a la más reciente de cada otro de su clase', () => {
    const raid = (slug: string, fecha: string, es: EspecializacionDato[], gr = grupo) => ({ slug, fecha, datos: { jugadores, meta: { grupo: gr }, especializaciones: es } });
    const p = especializacionesDePerfil([
      raid('vieja', '2026-11-01T21:00:00-03:00', [e('Jugador1', '1800200', '23'), e('Jugador2', '1800200', '34')]),
      raid('nueva', '2026-11-08T21:00:00-03:00', [e('Jugador1', '1800200', '12'), e('Jugador4', '1800400', '34')]),
      raid('sin', '2026-11-09T21:00:00-03:00', []),
    ], 'Jugador1')!;
    expect(p.suya).toEqual({ slug: 'nueva', fecha: '2026-11-08T21:00:00-03:00' });
    expect(p.fechas).toEqual(['2026-11-08T21:00:00-03:00', '2026-11-01T21:00:00-03:00']);
    expect(p.clase).toBe('cleric');
    expect(p.jugadores).toEqual(['Jugador1', 'Jugador2']);
    expect(p.filas[0]).toMatchObject({ habilidad: '1800200', opciones: ['12', '34'], estado: ['variada', 'variada'] });
    expect(especializacionesDePerfil([raid('sin', '2026-11-09T21:00:00-03:00', [])], 'Jugador1')).toBeNull();
  });
});

describe('buffs recibidos', () => {
  const b = (jugador: string, activo_pct: number, vivo_s = 600, lanzador = 'Jugador4', habilidad = '1800700'): BuffDato => ({ jugador, lanzador, habilidad, activo_pct, vivo_s });
  const datos = [
    b('Jugador1', 40), b('Jugador2', 70), b('Jugador3', 72), b('Jugador6', 68),   // Jugador1 lo recibe bastante menos
    b('Jugador2', 60, 600, 'Jugador5', '1800800'), b('Jugador3', 50, 600, 'Jugador5', '1800800'),   // 10 puntos, pero más del 75 %
    b('Jugador1', 5, 30, 'Jugador5', '1800900'), b('Jugador2', 80, 600, 'Jugador5', '1800900'),      // menos de un minuto vivo: no se juzga
    b('Jugador1', 30, 600, 'Jugador5', '1801000'),                                                     // un solo receptor: no cuenta
    b('Jugador1', 10, 600, 'Intruso', '1801100'), b('Jugador2', 80, 600, 'Intruso', '1801100'),       // lanzador de fuera del grupo
  ];
  const a = analizarBuffs(datos, grupo);

  it('agrupa por lanzador y buff, con dos receptores o más del grupo', () => {
    expect(a.buffs.map((x) => `${x.lanzador} ${x.habilidad}`)).toEqual(['Jugador4 1800700', 'Jugador5 1800800', 'Jugador5 1800900']);
  });

  it('marca a quien lo recibe un 25 % y 8 puntos menos que la mediana de los demás', () => {
    const r = a.buffs[0].receptores.find((x) => x.jugador === 'Jugador1')!;
    expect(r).toEqual({ jugador: 'Jugador1', pct: 40, vivoS: 600, mediana: 70, bajo: true });
    expect(a.buffs[1].receptores.some((x) => x.bajo)).toBe(false);
    expect(a.buffs[2].receptores.some((x) => x.bajo)).toBe(false);
    expect(a.bajos).toEqual([{ jugador: 'Jugador1', lanzador: 'Jugador4', habilidad: '1800700', pct: 40, mediana: 70 }]);
  });

  it('para la IA', () => {
    expect(buffsParaIA(a)).toEqual([{ jugador: 'Jugador1', buff: '1800700', de: 'Jugador4', su_tiempo_con_el_buff_pct: 40, el_de_los_demas_pct: 70 }]);
  });
});
