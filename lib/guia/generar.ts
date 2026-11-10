// Lo que las páginas del módulo «Raids» leen del contenido: las fichas validadas, el catálogo de fuentes y, de la
// estructura del juego, solo los jefes de las mazmorras de cada raid. Se guarda en lib/guia/contenido.generado.json
// (npm run contenido, también en cada build) para que las páginas lo importen sin leer el disco.
import type { Catalogo } from './esquema';
import type { Contenido } from './validar';

export type JefeJuego = { es: string; en: string; retrato: string | null; mazmorras: number[] };
export type ContenidoPaginas = {
  catalogo: Catalogo;
  raids: Contenido['raids'];
  /** Orden de las raids en el índice: el de los archivos (por id). */
  orden: string[];
  jefes: Record<string, JefeJuego>;
};

export function contenidoParaPaginas(c: Contenido): ContenidoPaginas {
  const orden = Object.keys(c.raids).sort();
  const mazmorras = new Set(orden.flatMap((id) => c.raids[id].es.mazmorras.map((m) => m.id)));
  const npcs = new Set(c.estructura.mazmorras.filter((m) => mazmorras.has(m.id)).flatMap((m) => m.jefes));
  for (const id of orden) for (const j of Object.values(c.raids[id].jefes)) for (const n of j.es.npc) npcs.add(n);
  const jefes = Object.fromEntries([...npcs].sort((a, b) => a - b).map((n) => [String(n), c.estructura.jefes[n]]).filter(([, j]) => j));
  return { catalogo: c.catalogo, raids: c.raids, orden, jefes };
}
