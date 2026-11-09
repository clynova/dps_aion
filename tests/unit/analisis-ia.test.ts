import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { proximoAnalisis, generarAnalisis } from '@/lib/analisis/ia';
import { NOTA_IA, PROMPT_SISTEMA, resumenParaIA, revisarAnalisis } from '@/lib/analisis/resumen';
import type { Mensaje, RespuestaIA } from '@/lib/analisis/deepseek';

const raid = JSON.parse(readFileSync('tests/fixtures/raid-v2-anonima.json', 'utf8'));
const grupo: string[] = raid.meta.grupo;
const primeraHab = raid.casteos[0].habilidad as string;
const nombres = { apodos: { [primeraHab]: 'Golpe de prueba' }, habilidades: {}, npcs: {} };

const valido = (lista = grupo) => ({
  pendiente: false,
  titular: `El grupo se atasca en ${primeraHab}.`,
  recomendaciones: [{ titulo: 'Hay que esquivarlo', texto: 'Mata a 3 personas por intento.' }],
  jugadores: Object.fromEntries(lista.map((n) => [n, [`Consejo para ${n}.`]])),
  notas: [],
});
const validoEn = () => ({
  pendiente: false,
  titular: `The group gets stuck on ${primeraHab}.`,
  recomendaciones: [{ titulo: 'Dodge it', texto: 'It kills 3 people in each attempt.' }],
  jugadores: Object.fromEntries(grupo.map((n) => [n, [`Advice for ${n}: you can do it.`]])),
  notas: [],
});

describe('resumen para la IA', () => {
  const r = resumenParaIA(raid, nombres, [{ fecha: '2026-11-01', intentos: 5, mejor_pct: 40, matado: false, muertes: 20, dps_grupo_medio: 100000 }]);

  it('quita la curva, agrupa los casteos y deja dps y muertes por intento', () => {
    expect(r.raid).not.toHaveProperty('curva');
    expect(r.raid).not.toHaveProperty('casteos');
    const total = r.raid.casteos_jefe.reduce((s, c) => s + c.veces, 0);
    expect(total).toBe(raid.casteos.length);
    expect(Object.keys(r.raid.dps_y_muertes_por_intento).length).toBeGreaterThan(0);
    expect(r.raids_anteriores_del_mismo_jefe).toHaveLength(1);
  });

  it('pone en el diccionario el nombre de cada id que sale (apodo primero)', () => {
    expect(r.nombres[primeraHab]).toBe('Golpe de prueba');
  });

  it('el prompt pide json (requisito del modo JSON de DeepSeek) e ids como números', () => {
    expect(PROMPT_SISTEMA).toMatch(/json/);
    expect(PROMPT_SISTEMA).toMatch(/números sueltos/);
  });
});

describe('revisión del análisis', () => {
  it('acepta un análisis completo', () => {
    expect(revisarAnalisis(valido(), grupo).problemas).toEqual([]);
  });
  it('exige un consejo para cada jugador del grupo y ninguno de fuera', () => {
    expect(revisarAnalisis(valido(grupo.slice(1)), grupo).problemas.join()).toContain(grupo[0]);
    expect(revisarAnalisis(valido([...grupo, 'Intruso']), grupo).problemas.join()).toContain('Intruso');
  });
  it('rechaza el formato incorrecto y las traducciones que no cuadran', () => {
    expect(revisarAnalisis({ titular: 'x' }, grupo).problemas.length).toBeGreaterThan(0);
    const es = revisarAnalisis(valido(), grupo).analisis!;
    const en = { ...valido(), recomendaciones: [] };
    expect(revisarAnalisis(en, grupo, es).problemas.length).toBeGreaterThan(0);
  });
});

describe('generarAnalisis con una IA simulada', () => {
  it('reintenta si falta un jugador, traduce y añade la nota de análisis automático', async () => {
    const llamadas: Mensaje[][] = [];
    const respuestas = [valido(grupo.slice(1)), valido(), validoEn()];
    const llamar = async (m: Mensaje[]): Promise<RespuestaIA> => {
      llamadas.push(m);
      return { json: respuestas[llamadas.length - 1], uso: { entrada: 1000, salida: 100, cache: 0 }, modelo: 'simulado' };
    };
    const { es, en, uso } = await generarAnalisis(raid, nombres, [], llamar);
    expect(llamadas).toHaveLength(3);
    expect(llamadas[1].at(-1)!.content).toContain(grupo[0]); // el reintento le dice qué faltaba
    expect(es.notas!.at(-1)).toEqual(NOTA_IA.es);
    expect(en.notas!.at(-1)).toEqual(NOTA_IA.en);
    expect(uso.entrada).toBe(3000);
  });
});

describe('espera de 24 h', () => {
  it('calcula cuándo se puede volver a analizar', () => {
    expect(proximoAnalisis(null)).toBeNull();
    expect(proximoAnalisis(new Date(Date.now() - 25 * 3_600_000))).toBeNull();
    const p = proximoAnalisis(new Date(Date.now() - 3_600_000))!;
    expect(Math.round((p.getTime() - Date.now()) / 3_600_000)).toBe(23);
  });
});

describe('habilidades citadas en los consejos', () => {
  it('rechaza que a un jugador se le recomiende una habilidad de jugador que no usa', async () => {
    const { habilidadesPorJugador } = await import('@/lib/analisis/resumen');
    const habs = habilidadesPorJugador(raid);
    const n = grupo[0];
    const suya = [...habs[n]].find((id) => /^1[1-9]\d{6}$/.test(id))!;
    const conSuya = valido(); conSuya.jugadores[n] = [`Usa más ${suya} y esquiva ${primeraHab}.`];
    expect(revisarAnalisis(conSuya, grupo, undefined, habs).problemas).toEqual([]);
    const conAjena = valido(); conAjena.jugadores[n] = ['Usa 19999990 antes del golpe.'];
    expect(revisarAnalisis(conAjena, grupo, undefined, habs).problemas.join()).toContain('19999990');
  });
});

describe('limpieza y clasificaciones', () => {
  it('quita el nombre entre paréntesis detrás de un id, pero no los valores', async () => {
    const { quitarNombresTrasIds } = await import('@/lib/analisis/resumen');
    const x = quitarNombresTrasIds({ t: ['Usa 13080000 (Postura de evasión) ante 1803396 (219650 de daño).'] });
    expect(x.t[0]).toBe('Usa 13080000 ante 1803396 (219650 de daño).');
  });
  it('ordena de mayor a menor para que la IA no compare a mano', async () => {
    const { clasificaciones } = await import('@/lib/analisis/resumen');
    const c = clasificaciones(raid);
    const muertes = c.muertes.map((m) => m[1]);
    expect(muertes).toEqual([...muertes].sort((a, b) => b - a));
    expect(c.dps.length).toBe(raid.jugadores.length);
  });
});

describe('limpieza con negrita', () => {
  it('también quita el nombre tras un id en negrita y ordena los intentos', async () => {
    const { quitarNombresTrasIds, clasificaciones } = await import('@/lib/analisis/resumen');
    expect(quitarNombresTrasIds('Usa **12320000** (Escudo de Nezekan) ya.')).toBe('Usa 12320000 ya.');
    expect(quitarNombresTrasIds('Llega al **60,6 %** y evita **1803396**.')).toBe('Llega al **60,6 %** y evita 1803396.');
    const c = clasificaciones(raid);
    expect(c.intentos_por_progreso[0][1]).toBe(Math.max(...raid.intentos.map((i: { progreso_pct: number }) => i.progreso_pct)));
  });
});

describe('traducción', () => {
  it('rechaza una «traducción» que sigue en español', async () => {
    const { pareceEspanol } = await import('@/lib/analisis/resumen');
    expect(pareceEspanol(['La noche se queda en el 60,6 % de vida del jefe y las muertes son el problema.'])).toBe(true);
    expect(pareceEspanol(['The night stalls at 60.6% of the boss health and the deaths are the problem.'])).toBe(false);
    const es = revisarAnalisis(valido(), grupo).analisis!;
    const sinTraducir = { ...valido(), titular: 'La noche se queda en el 60 % por las muertes de los jugadores y la falta de curación.' };
    expect(revisarAnalisis(sinTraducir, grupo, es).problemas.join()).toContain('Spanish');
  });
});

describe('tuteo', () => {
  it('detecta el vosotros sin confundir sustantivos', async () => {
    const { formasVosotros } = await import('@/lib/analisis/resumen');
    expect(formasVosotros(['Reservad defensivos.', 'Si rompéis la barra, ganáis tiempo.', 'Cubrid la zona.']).sort()).toEqual(['Cubrid', 'Reservad', 'ganáis', 'rompéis']);
    expect(formasVosotros(['Mitad de las muertes son evitables.', 'Usa tu defensiva. Guardemos escudos.', 'Conviene romper la barra; la salud importa.'])).toEqual([]);
  });
  it('pide reescribir un análisis que trata al grupo de vosotros', () => {
    const v = { ...valido(), recomendaciones: [{ titulo: 'Romped la barra.', texto: 'Así ganáis daño.' }] };
    expect(revisarAnalisis(v, grupo).problemas.join()).toContain('vosotros');
  });
});

describe('cifras y nombres de campos', () => {
  it('da formato a las cifras en crudo sin tocar los ids de la raid', async () => {
    const { formatearCifras, idsDeLaRaid } = await import('@/lib/analisis/resumen');
    const ids = new Set(['1803396']);
    expect(formatearCifras('Recibe 2456997 y 504604 de 1803396 (219650); dura 1216 s y llega al 60,6 %.', 'es', ids))
      .toBe('Recibe 2,46 M y 504,6k de 1803396 (219,7k); dura 1216 s y llega al 60,6 %.');
    expect(formatearCifras('Takes 2456997 from 1803396.', 'en', ids)).toBe('Takes 2.46M from 1803396.');
    expect(formatearCifras('Hace 15000 de daño.', 'es', ids)).toBe('Hace 15k de daño.');
    expect(idsDeLaRaid(raid).has(primeraHab)).toBe(true);
  });
  it('detecta nombres de campos del json en el texto', async () => {
    const { camposEnTexto } = await import('@/lib/analisis/resumen');
    expect(camposEnTexto(['No se rompió (rotura_s null) y vida_1s al 100 %.'], grupo)).toEqual(['rotura_s', 'vida_1s']);
    expect(camposEnTexto(['Pepe_99 muere 3 veces.'], ['Pepe_99'])).toEqual([]);
  });
});

describe('ids entre paréntesis', () => {
  it('pide escribir solo el id cuando la IA pone «nombre (id)»', () => {
    const v = { ...valido(), titular: `El impacto letal de la zona 9-2 (**${primeraHab}**) mata a media raid.` };
    expect(revisarAnalisis(v, grupo).problemas.join()).toContain('solo el id');
    expect(revisarAnalisis({ ...valido(), titular: `Evita ${primeraHab} (219650 de daño).` }, grupo).problemas).toEqual([]);
  });
});
