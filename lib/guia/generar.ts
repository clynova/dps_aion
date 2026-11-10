// Lo que las páginas del módulo «Raids» leen del contenido: las fichas validadas, el catálogo de fuentes, de la
// estructura del juego solo los jefes de las mazmorras de cada raid y, de la semilla de nombres (nombres.json /
// nombres.en.json), el nombre de cada ataque que citan las fichas. Se guarda en lib/guia/contenido.generado.json
// (npm run contenido, también en cada build) para que las páginas lo importen sin leer el disco ni la base.
import type { Catalogo } from './esquema';
import type { Contenido } from './validar';

export type JefeJuego = { es: string; en: string; retrato: string | null; mazmorras: number[] };
/** Semilla de nombres de un idioma: apodos (ganan) y nombres del juego. */
export type SemillaNombres = { apodos?: Record<string, string>; habilidades?: Record<string, string> };
export type ContenidoPaginas = {
  catalogo: Catalogo;
  raids: Contenido['raids'];
  /** Orden de las raids en el índice: el de los archivos (por id). */
  orden: string[];
  jefes: Record<string, JefeJuego>;
  /** Nombre de cada ataque citado en las fichas («Ataque <id>» si la semilla no lo tiene). */
  ataques: Record<string, { es: string; en: string }>;
};

const GENERICO = { es: 'Ataque', en: 'Attack' } as const;

export function contenidoParaPaginas(c: Contenido, nombres: { es: SemillaNombres; en: SemillaNombres }): ContenidoPaginas {
  const orden = Object.keys(c.raids).sort();
  const mazmorras = new Set(orden.flatMap((id) => c.raids[id].es.mazmorras.map((m) => m.id)));
  const npcs = new Set(c.estructura.mazmorras.filter((m) => mazmorras.has(m.id)).flatMap((m) => m.jefes));
  for (const id of orden) for (const j of Object.values(c.raids[id].jefes)) for (const n of j.es.npc) npcs.add(n);
  const jefes = Object.fromEntries([...npcs].sort((a, b) => a - b).map((n) => [String(n), c.estructura.jefes[n]]).filter(([, j]) => j));

  const ids = new Set<number>();
  for (const id of orden) for (const j of Object.values(c.raids[id].jefes)) for (const m of j.es.mecanicas) for (const a of m.ataques) ids.add(a);
  const nombre = (id: number, idioma: 'es' | 'en') => {
    const s = nombres[idioma];
    const n = s.apodos?.[id] ?? s.habilidades?.[id];
    return n && n !== GENERICO[idioma] ? n : `${GENERICO[idioma]} ${id}`;
  };
  const ataques = Object.fromEntries([...ids].sort((a, b) => a - b).map((id) => [String(id), { es: nombre(id, 'es'), en: nombre(id, 'en') }]));
  return { catalogo: c.catalogo, raids: c.raids, orden, jefes, ataques };
}
