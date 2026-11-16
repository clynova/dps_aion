// Pestaña «Sin filtro» (docs/plan-toxico.md): entrada, validación y generación con una IA simulada.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generarToxico } from '@/lib/analisis/ia';
import { habilidadesPorJugador } from '@/lib/analisis/resumen';
import { entradaToxico, muletillas, nivelesDeCulpa, NOTA_TOXICO, PROMPT_TOXICO, PROMPT_TRADUCIR_TOXICO, revisarToxico } from '@/lib/analisis/toxico';
import type { Mensaje, RespuestaIA } from '@/lib/analisis/deepseek';
import type { Analisis } from '@/lib/ingest/analisis';

const raid = JSON.parse(readFileSync('tests/fixtures/raid-v2-anonima.json', 'utf8'));
const grupo: string[] = raid.meta.grupo;
const nombres = { apodos: {}, habilidades: {}, npcs: {} };
const principal: Analisis = {
  pendiente: false, titular: 'El grupo se atasca en el 40 %.',
  recomendaciones: [{ titulo: 'Esquivar', texto: 'Mata a 3 por intento.' }],
  jugadores: Object.fromEntries(grupo.map((n) => [n, [`Consejo para ${n}.`]])),
  notas: [{ termino: 'Análisis automático', texto: 'Generado por IA.' }, { termino: 'Salida', texto: 'Alguien se fue.' }],
};

const niveles = nivelesDeCulpa(raid);
const peor = niveles[0].jugador;
const maximos = Object.fromEntries(niveles.map((n) => [n.jugador, n.pullas_max]));

const ES = ['Te libras hoy.', 'Por poco no sales.', 'Casi ni te vimos.', 'Pasas raspando.', 'Te salva la campana.', 'Hoy no toca.'];
const ESM = ['Muévete antes.', 'Guarda el escudo.', 'Mira el suelo.', 'Sigue al grupo.', 'Pega en la rotura.', 'Cura antes.'];
const EN = ['You get away today.', 'Barely made it.', 'We hardly saw you.', 'Scraping through.', 'Saved by the bell.', 'Not your turn.'];
const ENM = ['Move sooner.', 'Keep the shield.', 'Watch the floor.', 'Stay with the group.', 'Hit during the break.', 'Heal earlier.'];

const valido = (lista = grupo) => ({
  titular: 'Cinco intentos y el jefe ni se despeina.',
  jugadores: Object.fromEntries(lista.map((n, i) => [n, { pullas: n === peor ? ['Moriste 4 veces.', 'Abriste 3 wipes.'] : [ES[i % 6]], mejora: ESM[i % 6] }])),
});
const validoEn = () => ({
  titular: 'Five attempts and the boss did not even break a sweat.',
  jugadores: Object.fromEntries(grupo.map((n, i) => [n, { pullas: n === peor ? ['You died 4 times.', 'You opened 3 wipes.'] : [EN[i % 6]], mejora: ENM[i % 6] }])),
});

describe('entrada de «Sin filtro»', () => {
  it('lleva los datos de la raid y el análisis principal sin la nota automática', () => {
    const e = entradaToxico(raid, nombres, [], principal);
    expect(e.raid).toBeDefined();
    expect(e.clasificaciones).toBeDefined();
    expect(e.analisis_principal.titular).toBe(principal.titular);
    expect(e.analisis_principal.notas.map((n) => n.termino)).toEqual(['Salida']);
  });

  it('el prompt pide crueldad sobre la jugada y no sobre la persona', () => {
    expect(PROMPT_TOXICO).toMatch(/nunca a la persona/);
    expect(PROMPT_TOXICO).toMatch(/No contradigas analisis_principal/);
    expect(PROMPT_TRADUCIR_TOXICO).toMatch(/same cruel/);
  });
});

describe('nivel de culpa', () => {
  it('un nivel por jugador del grupo, ordenado de más a menos culpa y con su tope de pullas', () => {
    expect(niveles.map((n) => n.jugador).sort()).toEqual([...grupo].sort());
    expect(niveles[0].nivel).toBe('alto');
    const orden = { alto: 0, medio: 1, bajo: 2 } as const;
    for (let i = 1; i < niveles.length; i++) expect(orden[niveles[i].nivel]).toBeGreaterThanOrEqual(orden[niveles[i - 1].nivel]);
    expect(niveles.every((n) => n.pullas_max === { alto: 4, medio: 2, bajo: 1 }[n.nivel])).toBe(true);
  });
  it('se mide frente a la mediana del grupo y quien no muere es bajo', () => {
    const d = { meta: { grupo: ['A', 'B', 'C', 'D', 'E', 'F'] }, jugadores: [
      { jugador: 'A', muertes: 5 }, { jugador: 'B', muertes: 3 }, { jugador: 'C', muertes: 3 }, { jugador: 'D', muertes: 3 }, { jugador: 'E', muertes: 1 }, { jugador: 'F', muertes: 0 }],
      detalle: {
        A: { muertes: [10, 30, 40, 50, 60].map((t) => ({ intento: 1, t, habilidad: '1803000' })) },
        B: { muertes: [20, 30, 40].map((t) => ({ intento: 1, t, habilidad: '1803000' })) },
      } };
    const n = Object.fromEntries(nivelesDeCulpa(d).map((x) => [x.jugador, x]));
    expect(n.A.abre_intentos).toBe(1);
    expect(n.B.abre_intentos).toBe(0);
    // puntos 6,5 · 3 · 3 · 3 · 1 · 0: mediana 3
    expect([n.A.nivel, n.B.nivel, n.C.nivel, n.D.nivel]).toEqual(['alto', 'medio', 'medio', 'medio']);
    expect(n.E.nivel).toBe('bajo');
    expect(n.F.nivel).toBe('bajo');
  });
  it('no cuenta los pulls fallidos ni abre un intento con una muerte sin habilidad', () => {
    const d = { meta: { grupo: ['A', 'B'] }, intentos: [{ intento: 1, progreso_pct: 0 }, { intento: 2, progreso_pct: 40 }],
      detalle: {
        A: { muertes: [{ intento: 1, t: 0, habilidad: '' }, { intento: 1, t: 5, habilidad: '1803000' }, { intento: 2, t: 3, habilidad: '' }] },
        B: { muertes: [{ intento: 2, t: 50, habilidad: '1803000' }] },
      } };
    const n = Object.fromEntries(nivelesDeCulpa(d).map((x) => [x.jugador, x]));
    expect(n.A.muertes).toBe(1);
    expect(n.A.abre_intentos).toBe(0);
    expect(n.B.abre_intentos).toBe(1);
  });
  it('va en la entrada de la IA, sin los debuffs sobre el jefe', () => {
    const e = entradaToxico(raid, nombres, [], principal);
    expect(e.nivel_de_culpa).toHaveLength(grupo.length);
    if (e.ventanas_de_dano) expect(e.ventanas_de_dano.debuffs_sobre_el_jefe).toEqual([]);
  });
});

describe('revisarToxico', () => {
  it('no deja pasar del tope de pullas de cada uno', () => {
    const bajo = niveles.find((n) => n.nivel === 'bajo')!.jugador;
    const x = valido(); x.jugadores[bajo].pullas = ['Una.', 'Dos.'];
    expect(revisarToxico(x, grupo, undefined, undefined, maximos).problemas.join()).toContain(bajo);
    expect(revisarToxico(valido(), grupo, undefined, undefined, maximos).toxico).toBeDefined();
  });
  it('rechaza las muletillas repetidas en tres jugadores', () => {
    const x = valido();
    for (const n of grupo.slice(0, 3)) x.jugadores[n].mejora = 'Muévete, que no es tan complicado.';
    expect(muletillas(x)).toContain('muévete que no es tan');
    expect(revisarToxico(x, grupo).problemas.join()).toContain('repites');
  });

  it('acepta uno bien hecho', () => {
    expect(revisarToxico(valido(), grupo).problemas).toEqual([]);
  });
  it('exige a todo el grupo y a nadie más', () => {
    expect(revisarToxico(valido(grupo.slice(1)), grupo).problemas.join()).toContain(grupo[0]);
    expect(revisarToxico(valido([...grupo, 'Intruso']), grupo).problemas.join()).toContain('Intruso');
  });
  it('rechaza más de 4 pullas o ninguna', () => {
    const x = valido(); x.jugadores[grupo[0]].pullas = ['a', 'b', 'c', 'd', 'e'];
    expect(revisarToxico(x, grupo).toxico).toBeUndefined();
    x.jugadores[grupo[0]].pullas = [];
    expect(revisarToxico(x, grupo).toxico).toBeUndefined();
  });
  it('rechaza vosotros y nombres de campos', () => {
    const x = valido(); x.titular = 'Tenéis un problema con vida_1s.';
    const p = revisarToxico(x, grupo).problemas.join();
    expect(p).toContain('vosotros');
    expect(p).toContain('vida_1s');
  });
  it('rechaza habilidades de jugador que no usa', () => {
    const x = valido(); x.jugadores[grupo[0]].mejora = 'Usa 19999999 más.';
    expect(revisarToxico(x, grupo, undefined, habilidadesPorJugador(raid)).problemas.join()).toContain('19999999');
  });
  it('en la traducción, misma estructura y en inglés', () => {
    const es = revisarToxico(valido(), grupo).toxico!;
    expect(revisarToxico(validoEn(), grupo, es).toxico).toBeDefined();
    expect(revisarToxico(valido(), grupo, es).problemas.join()).toContain('Spanish');
    const corta = validoEn(); corta.jugadores[peor].pullas = ['Only one.'];
    expect(revisarToxico(corta, grupo, es).problemas.join()).toContain(peor);
  });
});

describe('generarToxico con una IA simulada', () => {
  it('reintenta lo que no vale, traduce y añade la nota', async () => {
    const respuestas = [valido(grupo.slice(1)), valido(), validoEn()];
    const llamadas: Mensaje[][] = [];
    const llamar = async (m: Mensaje[]): Promise<RespuestaIA> => {
      llamadas.push(m);
      return { json: respuestas[llamadas.length - 1], uso: { entrada: 1000, salida: 100, cache: 0 }, modelo: 'simulado' };
    };
    const { es, en, uso } = await generarToxico(raid, nombres, [], principal, llamar);
    expect(llamadas).toHaveLength(3);
    expect(llamadas[1].at(-1)!.content).toContain(grupo[0]);
    expect(llamadas[0][0].content).toBe(PROMPT_TOXICO);
    expect(JSON.parse(llamadas[0][1].content).analisis_principal.titular).toBe(principal.titular);
    expect(es.notas?.at(-1)).toEqual(NOTA_TOXICO.es);
    expect(en.notas?.at(-1)).toEqual(NOTA_TOXICO.en);
    expect(en.jugadores[peor].pullas).toHaveLength(2);
    expect(uso.entrada).toBe(3000);
  });
});
