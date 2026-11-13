// Comprueba el contenido del módulo «Raids» entero (puro: recibe los archivos ya leídos). Lo usan
// scripts/validar-contenido.mts (en el build: un error para el despliegue) y tests/unit/guia.test.ts.
//   archivos: rutas bajo contenido/raids/ → JSON. «<raid>/raid.<idioma>.json» y «<raid>/<npc>.<idioma>.json».
import type { z } from 'zod';
import { Catalogo, CLAVES_TEXTO, Estructura, FichaJefe, FichaRaid, type Origen } from './esquema';
import { esInfografia } from './infografias';

export type Idioma = 'es' | 'en';
type Raid = { es: FichaRaid; en: FichaRaid; jefes: Record<number, { es: FichaJefe; en: FichaJefe }> };
export type Contenido = { estructura: Estructura; catalogo: Catalogo; raids: Record<string, Raid> };

const RUTA = /^([a-z0-9-]+)\/(raid|\d+)\.(es|en)\.json$/;

function zodErrores(ruta: string, e: z.ZodError): string[] {
  return e.issues.map((i) => `${ruta}: ${i.path.join('.') || '(raíz)'}: ${i.message}`);
}

/** Todo menos los textos tiene que ser igual en los dos idiomas (ids, cifras, fuentes, orden). */
export function diferenciasIdioma(es: unknown, en: unknown, ruta = ''): string[] {
  if (Array.isArray(es) || Array.isArray(en)) {
    if (!Array.isArray(es) || !Array.isArray(en)) return [`${ruta || '(raíz)'}: uno es lista y el otro no`];
    if (es.length !== en.length) return [`${ruta || '(raíz)'}: ${es.length} elementos en es y ${en.length} en en`];
    return es.flatMap((x, i) => diferenciasIdioma(x, en[i], `${ruta}[${i}]`));
  }
  if (es && en && typeof es === 'object' && typeof en === 'object') {
    const a = es as Record<string, unknown>, b = en as Record<string, unknown>;
    const claves = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return claves.flatMap((k) => {
      const r = ruta ? `${ruta}.${k}` : k;
      if (!(k in a) || !(k in b)) return [`${r}: falta en ${k in a ? 'en' : 'es'}`];
      if (CLAVES_TEXTO.has(k) && typeof a[k] === 'string' && typeof b[k] === 'string') return [];
      return diferenciasIdioma(a[k], b[k], r);
    });
  }
  return es === en ? [] : [`${ruta || '(raíz)'}: ${JSON.stringify(es)} en es y ${JSON.stringify(en)} en en`];
}

/** Recorre una ficha y devuelve cada { origen, fuentes } con su ruta. */
function afirmaciones(x: unknown, ruta = ''): { ruta: string; origen: Origen; fuentes: string[] }[] {
  if (Array.isArray(x)) return x.flatMap((v, i) => afirmaciones(v, `${ruta}[${i}]`));
  if (!x || typeof x !== 'object') return [];
  const o = x as Record<string, unknown>;
  const propias = typeof o.origen === 'string' ? [{ ruta: ruta || '(raíz)', origen: o.origen as Origen, fuentes: (o.fuentes as string[]) ?? [] }] : [];
  return [...propias, ...Object.entries(o).flatMap(([k, v]) => afirmaciones(v, ruta ? `${ruta}.${k}` : k))];
}

export function validarContenido(entrada: { estructura: unknown; catalogo: unknown; archivos: Record<string, unknown> }):
  { errores: string[]; contenido: Contenido | null } {
  const errores: string[] = [];
  const est = Estructura.safeParse(entrada.estructura);
  if (!est.success) errores.push(...zodErrores('juego/estructura.json', est.error));
  const cat = Catalogo.safeParse(entrada.catalogo);
  if (!cat.success) errores.push(...zodErrores('raids/fuentes.json', cat.error));
  if (!est.success || !cat.success) return { errores, contenido: null };

  const estructura = est.data, catalogo = cat.data;
  const fuentes = new Map(catalogo.fuentes.map((f) => [f.id, f]));
  if (fuentes.size !== catalogo.fuentes.length) errores.push('raids/fuentes.json: hay ids de fuente repetidos');
  const mazmorras = new Map(estructura.mazmorras.map((m) => [m.id, m]));

  // Agrupar los archivos por raid, ficha e idioma.
  const porFicha = new Map<string, Partial<Record<Idioma, unknown>>>();
  for (const [ruta, json] of Object.entries(entrada.archivos)) {
    const m = RUTA.exec(ruta);
    if (!m) { errores.push(`raids/${ruta}: nombre de archivo no válido (<raid>/raid.<es|en>.json o <raid>/<npc>.<es|en>.json)`); continue; }
    const clave = `${m[1]}/${m[2]}`;
    porFicha.set(clave, { ...porFicha.get(clave), [m[3]]: json });
  }

  const raids: Record<string, Raid> = {};
  const jefesSueltos: [string, string, { es: FichaJefe; en: FichaJefe }][] = [];

  for (const [clave, idiomas] of [...porFicha].sort(([a], [b]) => a.localeCompare(b))) {
    const [raid, ficha] = clave.split('/');
    const Esquema = ficha === 'raid' ? FichaRaid : FichaJefe;
    const leidas: Partial<Record<Idioma, FichaRaid | FichaJefe>> = {};
    for (const idioma of ['es', 'en'] as const) {
      const ruta = `raids/${clave}.${idioma}.json`;
      if (idiomas[idioma] === undefined) { errores.push(`${ruta}: falta (cada ficha va en es y en)`); continue; }
      const r = Esquema.safeParse(idiomas[idioma]);
      if (r.success) leidas[idioma] = r.data; else errores.push(...zodErrores(ruta, r.error));
    }
    if (!leidas.es || !leidas.en) continue;
    errores.push(...diferenciasIdioma(leidas.es, leidas.en).map((d) => `raids/${clave}: es y en no coinciden: ${d}`));

    // Fuentes y origen de cada afirmación (basta con el español: el inglés ya es igual salvo los textos).
    for (const a of afirmaciones(leidas.es)) {
      const donde = `raids/${clave}: ${a.ruta}`;
      for (const f of a.fuentes) if (!fuentes.has(f)) errores.push(`${donde}: fuente «${f}» no está en fuentes.json`);
      const tipos = a.fuentes.map((f) => fuentes.get(f)?.tipo);
      if (a.origen === 'guias' && new Set(a.fuentes).size < 2) errores.push(`${donde}: origen «guias» necesita al menos 2 fuentes`);
      if (a.origen === 'oficial' && !tipos.includes('oficial')) errores.push(`${donde}: origen «oficial» necesita una fuente oficial`);
      if (a.origen === 'juego' && !tipos.some((t) => t === 'juego' || t === 'base-de-datos')) errores.push(`${donde}: origen «juego» necesita una fuente de datos del juego`);
    }

    if (ficha === 'raid') {
      const r = leidas.es as FichaRaid;
      if (r.id !== raid) errores.push(`raids/${clave}: id «${r.id}» y carpeta «${raid}» no coinciden`);
      for (const m of r.mazmorras) if (!mazmorras.has(m.id)) errores.push(`raids/${clave}: la mazmorra ${m.id} no está en la estructura del juego`);
      const principal = mazmorras.get(r.mazmorras[0].id);
      for (const n of r.jefes) if (principal && !principal.jefes.includes(n)) errores.push(`raids/${clave}: el jefe ${n} no es de la mazmorra ${principal.id}`);
      raids[raid] = { es: r, en: leidas.en as FichaRaid, jefes: {} };
    } else {
      const j = leidas.es as FichaJefe;
      if (String(j.npc[0]) !== ficha) errores.push(`raids/${clave}: el archivo se llama ${ficha} y su primer npc es ${j.npc[0]}`);
      if (j.raid !== raid) errores.push(`raids/${clave}: raid «${j.raid}» y carpeta «${raid}» no coinciden`);
      for (const n of j.npc) if (!estructura.jefes[n]) errores.push(`raids/${clave}: el npc ${n} no es jefe de ninguna mazmorra`);
      const ids = j.mecanicas.map((m) => m.id);
      if (new Set(ids).size !== ids.length) errores.push(`raids/${clave}: ids de mecánica repetidos`);
      for (const m of j.mecanicas) if (m.infografia && !esInfografia(m.infografia)) errores.push(`raids/${clave}: la infografía «${m.infografia}» de «${m.id}» no existe (lib/guia/infografias.ts)`);
      jefesSueltos.push([raid, ficha, { es: j, en: leidas.en as FichaJefe }]);
    }
  }

  for (const [raid, ficha, j] of jefesSueltos) {
    const r = raids[raid];
    if (!r) { errores.push(`raids/${raid}/${ficha}: la carpeta no tiene raid.es.json / raid.en.json válidos`); continue; }
    if (!r.es.jefes.includes(Number(ficha))) errores.push(`raids/${raid}/${ficha}: el jefe no está en la lista de jefes de la raid`);
    r.jefes[Number(ficha)] = j;
  }

  return { errores, contenido: errores.length ? null : { estructura, catalogo, raids } };
}
