import { describe, expect, it } from 'vitest';
import { leerContenido, leerNombres } from '@/lib/guia/leer';
import { diferenciasIdioma, validarContenido } from '@/lib/guia/validar';
import estructuraReal from '@/contenido/juego/estructura.json';

// Una raid inventada sobre una estructura mínima (los ids sí son de verdad: mazmorra 600082 y sus jefes).
const estructura = {
  fuente: 'questlog-game-data', game_data: '2026-11-10', generado: '2026-11-10',
  mazmorras: [{ id: 600082, jefes: [2301006, 2301007, 2301008, 2301014] }, { id: 600083, jefes: [2300282, 2300283, 2300284, 2300290] }],
  jefes: Object.fromEntries([2301006, 2301007, 2301008, 2301014, 2300282, 2300283, 2300284, 2300290]
    .map((n) => [String(n), { es: `Jefe ${n}`, en: `Boss ${n}`, retrato: null, mazmorras: [n > 2301000 ? 600082 : 600083] }])),
  stats: { critical: { stat: 128, categoria: 'BookMark', nombre: 'Critical Hit', descripcion: 'Max 50%.' } },
};
const fuente = (id: string, tipo: string) => ({ id, titulo: id, sitio: id, url: `https://example.com/${id}`, tipo, idioma: 'en', consultado: '2026-11-10', temas: ['mecanicas'] });
const catalogo = { fuentes: [fuente('guia-a', 'guia'), fuente('guia-b', 'guia'), fuente('oficial', 'oficial'), fuente('cliente', 'juego')] };

const raid = (idioma: 'es' | 'en') => ({
  id: 'prueba', nombre: idioma === 'es' ? 'Raid de prueba' : 'Test raid', revisado: '2026-11-10', parche: '2026-11-04',
  resumen: idioma === 'es' ? 'Cuatro jefes.' : 'Four bosses.',
  mazmorras: [{ id: 600082, modo: 'normal', origen: 'juego', fuentes: ['cliente'] }, { id: 600083, modo: 'dificil', origen: 'juego', fuentes: ['cliente'] }],
  jugadores: 10, jefes: [2301006, 2301007, 2301008, 2301014],
  gs: { normal: { valor: 2800, origen: 'guias', fuentes: ['guia-a', 'guia-b'] } },
  reglas: [{ texto: idioma === 'es' ? 'Una hora por intento.' : 'One hour per run.', origen: 'oficial', fuentes: ['oficial'] }],
});
const jefe = (idioma: 'es' | 'en') => ({
  npc: [2301014, 2300290], raid: 'prueba', revisado: '2026-11-10', parche: '2026-11-04',
  resumen: idioma === 'es' ? 'El jefe final.' : 'The final boss.',
  fases: [{ titulo: 'F1', desde_vida: 100, hasta_vida: 60, texto: 'x', origen: 'datos' }],
  mecanicas: [{ id: 'agujeros', titulo: 'A', texto: 'x', como: 'y', ataques: [1803230, 1803235], wipe: true, roles: ['todos'], origen: 'guias', fuentes: ['guia-a', 'guia-b'] }],
  consejos: { sanador: [{ texto: idioma === 'es' ? 'Cura' : 'Heal', origen: 'deduccion' }] },
  requisitos: { critico: { min: 1200, max: 1700, origen: 'guias', fuentes: ['guia-a', 'guia-b'] } },
});
const archivos = () => ({
  'prueba/raid.es.json': raid('es'), 'prueba/raid.en.json': raid('en'),
  'prueba/2301014.es.json': jefe('es'), 'prueba/2301014.en.json': jefe('en'),
});
const validar = (a: Record<string, unknown>, c: unknown = catalogo) => validarContenido({ estructura, catalogo: c, archivos: a });

describe('contenido del repo', () => {
  it('contenido/ es válido (si falla: corregir la ficha o npm run juego)', () => {
    const { errores } = leerContenido();
    expect(errores).toEqual([]);
  });
  it('la estructura del juego tiene los cuatro jefes de Ludra con nombre en los dos idiomas', () => {
    const ludra = estructuraReal.mazmorras.find((m) => m.id === 600082);
    expect(ludra?.jefes).toEqual([2301006, 2301007, 2301008, 2301014]);
    expect(estructuraReal.jefes['2301014']).toMatchObject({ es: 'Ludra de la eternidad', en: 'Eternal Ludra' });
  });
});

describe('validarContenido', () => {
  it('acepta una raid bien hecha y la devuelve agrupada', () => {
    const { errores, contenido } = validar(archivos());
    expect(errores).toEqual([]);
    expect(contenido?.raids.prueba.en.nombre).toBe('Test raid');
    expect(contenido?.raids.prueba.jefes[2301014].es.mecanicas[0].ataques).toEqual([1803230, 1803235]);
  });
  it('cada ficha tiene que estar en los dos idiomas', () => {
    const a: Record<string, unknown> = archivos();
    delete a['prueba/2301014.en.json'];
    expect(validar(a).errores).toEqual(['raids/prueba/2301014.en.json: falta (cada ficha va en es y en)']);
  });
  it('fuera de los textos, es y en tienen que ser iguales', () => {
    const en = jefe('en');
    en.mecanicas[0].ataques = [1803230];
    en.requisitos.critico.max = 1600;
    const errores = validar({ ...archivos(), 'prueba/2301014.en.json': en }).errores;
    expect(errores).toHaveLength(2);
    expect(errores.join('\n')).toMatch(/mecanicas\[0\]\.ataques: 2 elementos en es y 1 en en/);
    expect(errores.join('\n')).toMatch(/requisitos\.critico\.max: 1700 en es y 1600 en en/);
  });
  it('fuentes: que existan y que el origen tenga las que pide', () => {
    const es = jefe('es'), en = jefe('en');
    for (const j of [es, en]) {
      j.mecanicas[0].fuentes = ['guia-a'];                       // guias con una sola fuente
      j.requisitos.critico.fuentes = ['guia-a', 'no-existe'];    // fuente que no está en el catálogo
    }
    const errores = validar({ ...archivos(), 'prueba/2301014.es.json': es, 'prueba/2301014.en.json': en }).errores;
    expect(errores).toEqual([
      'raids/prueba/2301014: mecanicas[0]: origen «guias» necesita al menos 2 fuentes',
      'raids/prueba/2301014: requisitos.critico: fuente «no-existe» no está en fuentes.json',
    ]);
  });
  it('origen oficial sin fuente oficial', () => {
    const r = (i: 'es' | 'en') => ({ ...raid(i), reglas: [{ texto: 'x', origen: 'oficial', fuentes: ['guia-a'] }] });
    expect(validar({ ...archivos(), 'prueba/raid.es.json': r('es'), 'prueba/raid.en.json': r('en') }).errores)
      .toEqual(['raids/prueba/raid: reglas[0]: origen «oficial» necesita una fuente oficial']);
  });
  it('ids del juego: mazmorra, jefes de la raid y npc de la ficha', () => {
    const r = (i: 'es' | 'en') => ({ ...raid(i), jefes: [2301006, 2300290] });
    const errores = validar({ ...archivos(), 'prueba/raid.es.json': r('es'), 'prueba/raid.en.json': r('en') }).errores;
    expect(errores).toContain('raids/prueba/raid: el jefe 2300290 no es de la mazmorra 600082');
    expect(errores).toContain('raids/prueba/2301014: el jefe no está en la lista de jefes de la raid');
  });
  it('el archivo se llama como el primer npc y va en la carpeta de su raid', () => {
    const a: Record<string, unknown> = archivos();
    a['prueba/2301008.es.json'] = jefe('es');
    a['prueba/2301008.en.json'] = jefe('en');
    expect(validar(a).errores).toEqual(['raids/prueba/2301008: el archivo se llama 2301008 y su primer npc es 2301014']);
  });
  it('rechaza claves desconocidas, rangos al revés y nombres de archivo raros', () => {
    const es = { ...jefe('es'), dificultad: 'alta', requisitos: { critico: { min: 1800, max: 1700, origen: 'deduccion' } } };
    const en = { ...jefe('en'), dificultad: 'alta', requisitos: { critico: { min: 1800, max: 1700, origen: 'deduccion' } } };
    const errores = validar({ ...archivos(), 'prueba/2301014.es.json': es, 'prueba/2301014.en.json': en, 'prueba/notas.json': {} }).errores;
    expect(errores.some((e) => e.includes('notas.json: nombre de archivo no válido'))).toBe(true);
    expect(errores.some((e) => e.includes('2301014.es.json') && e.includes('dificultad'))).toBe(true);
    expect(errores.some((e) => e.includes('2301014.es.json') && e.includes('min mayor que max'))).toBe(true);
  });
  it('un jefe sin la ficha de su raid', () => {
    const a: Record<string, unknown> = archivos();
    delete a['prueba/raid.es.json'];
    delete a['prueba/raid.en.json'];
    expect(validar(a).errores).toEqual(['raids/prueba/2301014: la carpeta no tiene raid.es.json / raid.en.json válidos']);
  });
  it('ids de fuente repetidos en el catálogo', () => {
    expect(validar(archivos(), { fuentes: [...catalogo.fuentes, fuente('guia-a', 'guia')] }).errores)
      .toEqual(['raids/fuentes.json: hay ids de fuente repetidos']);
  });
});

describe('diferenciasIdioma', () => {
  it('ignora solo las claves de texto', () => {
    expect(diferenciasIdioma({ titulo: 'Hola', id: 'a' }, { titulo: 'Hello', id: 'a' })).toEqual([]);
    expect(diferenciasIdioma({ titulo: 'Hola', id: 'a' }, { titulo: 'Hello', id: 'b' })).toEqual(['id: "a" en es y "b" en en']);
    expect(diferenciasIdioma({ fuentes: ['x'] }, {})).toEqual(['fuentes: falta en en']);
  });
});

describe('contenido para las páginas', () => {
  it('lib/guia/contenido.generado.json está al día (si falla: npm run contenido)', async () => {
    const { contenidoParaPaginas } = await import('@/lib/guia/generar');
    const generado = (await import('@/lib/guia/contenido.generado.json')).default;
    const { contenido } = leerContenido();
    expect(JSON.parse(JSON.stringify(contenidoParaPaginas(contenido!, leerNombres())))).toEqual(JSON.parse(JSON.stringify(generado)));
  });
  it('Ludra: orden de los jefes, sus npc en los dos modos y las fuentes de la ficha', async () => {
    const { raidGuia, npcsDelJefe, npcsDeRaid, fuentesDe, nombreJefe } = await import('@/lib/guia/contenido');
    const ludra = raidGuia('ludra')!;
    expect(ludra.es.jefes.map((n) => nombreJefe(n, 'es'))).toEqual(['Reactor de fusión abismal central', 'Rahu aislado', 'Alas abismales Ketu', 'Ludra de la eternidad']);
    expect(npcsDelJefe(ludra, 2301014)).toEqual([2301014, 2300290]);
    expect(npcsDeRaid(ludra).sort()).toEqual([2300282, 2300283, 2300284, 2300290, 2301006, 2301007, 2301008, 2301014]);
    expect(fuentesDe(ludra.es)).toContain('timesaver-gs');
    expect(raidGuia('toString')).toBeNull();
    const { nombreAtaque } = await import('@/lib/guia/contenido');
    expect(nombreAtaque(1803010, 'es')).toBe('Prueba de Ludra');
    expect(nombreAtaque(1803010, 'en')).toBe("Ludra's Trial");
    expect(nombreAtaque(1802570, 'en')).toBe('Attack 1802570');
    expect(Object.keys(ludra.jefes).sort()).toEqual(['2301006', '2301007', '2301008', '2301014']);
  });
});

describe('sumarCifras', () => {
  it('suma por etiqueta, sin contar dos veces la misma raid y el mismo npc', async () => {
    const { sumarCifras } = await import('@/lib/guia/sumar-cifras');
    const f = (npc: number, grupo: string, raid: string, intentos: number, matado: boolean, dia: string) => ({ npc, grupo, raid, intentos, matado, fecha: new Date(`${dia}T20:00:00Z`) });
    const filas = [
      f(2301014, 'g1', 'r1', 8, false, '2026-11-08'), f(2301008, 'g1', 'r1', 1, true, '2026-11-08'),
      f(2301014, 'g1', 'r2', 5, true, '2026-11-10'), f(2301014, 'g1', 'r2', 5, true, '2026-11-10'), // repetida
      f(2300290, 'g2', 'r3', 3, false, '2026-11-09'),
    ];
    const c = sumarCifras(filas, { ludra: [2301014, 2300290], reactor: [2301008], raid: [2301014, 2300290, 2301008], nadie: [1] });
    expect(c.get('ludra')).toEqual({ noches: 3, grupos: 2, intentos: 16, kills: 1, ultima: '2026-11-10T20:00:00.000Z' });
    expect(c.get('reactor')).toMatchObject({ noches: 1, intentos: 1, kills: 1 });
    expect(c.get('raid')).toMatchObject({ noches: 3, intentos: 17, kills: 2 });
    expect(c.has('nadie')).toBe(false);
  });
});
