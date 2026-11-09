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
  recomendaciones: [{ titulo: 'Esquivad', texto: 'Mata a 3 personas por intento.' }],
  jugadores: Object.fromEntries(lista.map((n) => [n, [`Consejo para ${n}.`]])),
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
    const respuestas = [valido(grupo.slice(1)), valido(), valido()];
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
