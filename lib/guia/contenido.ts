// Acceso al contenido del módulo «Raids» para las páginas: sale de lib/guia/contenido.generado.json (npm run contenido),
// que ya está validado. Sin base de datos ni disco: se puede usar en cualquier parte.
import datos from './contenido.generado.json';
import type { Fuente } from './esquema';
import type { ContenidoPaginas, JefeJuego } from './generar';
import type { Idioma } from '@/lib/i18n';

const C = datos as unknown as ContenidoPaginas;

export type RaidGuia = ContenidoPaginas['raids'][string];

export const raidsGuia = (): RaidGuia[] => C.orden.map((id) => C.raids[id]);
export const raidGuia = (id: string): RaidGuia | null => (Object.hasOwn(C.raids, id) ? C.raids[id] : null);
export const jefeJuego = (npc: number): JefeJuego | null => C.jefes[String(npc)] ?? null;
export const nombreJefe = (npc: number, idioma: Idioma) => jefeJuego(npc)?.[idioma] ?? String(npc);
/** Nombre de un ataque citado en una ficha (de la semilla de nombres). */
export const nombreAtaque = (id: number, idioma: Idioma) => C.ataques[String(id)]?.[idioma] ?? String(id);
export const fuenteGuia = (id: string): Fuente | null => C.catalogo.fuentes.find((f) => f.id === id) ?? null;

/** Retrato del jefe en el CDN de questlog.gg (ruta corta bajo Texture/). */
export const urlRetrato = (r: string | null | undefined) => (r ? `https://cdn.questlog.gg/aion-2/assets/Game/UI/Resource/Texture/${r}.webp` : null);

/** Los npc del mismo jefe en todos los modos de la raid: los de sus mazmorras con el mismo nombre en inglés. */
export function npcsDelJefe(raid: RaidGuia, npc: number): number[] {
  const nombre = jefeJuego(npc)?.en;
  const otros = mazmorrasDe(raid).flatMap((m) => m.jefes).filter((n) => n !== npc && nombre && jefeJuego(n)?.en === nombre);
  return [npc, ...new Set(otros)];
}

/** Mazmorras de una raid con sus jefes (de la estructura del juego), en el orden de la ficha. */
export function mazmorrasDe(raid: RaidGuia): { id: number; modo: string; jefes: number[] }[] {
  return raid.es.mazmorras.map((m) => ({
    id: m.id, modo: m.modo,
    jefes: Object.entries(C.jefes).filter(([, j]) => j.mazmorras.includes(m.id)).map(([n]) => Number(n)).sort((a, b) => a - b),
  }));
}

/** Ids de todas las fuentes citadas en una ficha (en el orden en que salen). */
export function fuentesDe(x: unknown): string[] {
  if (Array.isArray(x)) return x.flatMap(fuentesDe);
  if (!x || typeof x !== 'object') return [];
  return Object.entries(x).flatMap(([k, v]) => (k === 'fuentes' && Array.isArray(v) ? v.map(String) : fuentesDe(v)));
}

/** Todos los npc de la raid, en todos sus modos. */
export const npcsDeRaid = (raid: RaidGuia) => [...new Set(mazmorrasDe(raid).flatMap((m) => m.jefes))];

// ── Enlaces desde las raids (fase 7) ───────────────────────────────────────────────────────────────────

export type MecanicaEnGuia = { raid: string; npc: number; mecanica: string; titulo: { es: string; en: string }; ruta: string };

/** Índice id de ataque → mecánica de la guía que lo cita (la primera, por orden de raid, jefe y mecánica). */
const POR_ATAQUE = (() => {
  const m = new Map<string, MecanicaEnGuia>();
  for (const id of C.orden) for (const npc of C.raids[id].es.jefes) {
    const f = C.raids[id].jefes[npc];
    if (!f) continue;
    f.es.mecanicas.forEach((mec, i) => {
      for (const a of mec.ataques) if (!m.has(String(a))) {
        m.set(String(a), { raid: id, npc, mecanica: mec.id, titulo: { es: mec.titulo, en: f.en.mecanicas[i].titulo }, ruta: `/guias/${id}/${npc}#m-${mec.id}` });
      }
    });
  }
  return m;
})();

/** La mecánica de la guía en la que sale ese ataque (o null). */
export const mecanicaDeAtaque = (id: string | number): MecanicaEnGuia | null => POR_ATAQUE.get(String(id)) ?? null;

/** La página de la guía de un jefe a partir de cualquiera de sus npc (Normal o Difícil), o null si no está en la guía. */
export function jefeEnGuia(npc: number): { raid: string; npc: number; ruta: string } | null {
  for (const id of C.orden) {
    const r = C.raids[id];
    for (const principal of r.es.jefes) {
      if (principal === npc || r.jefes[principal]?.es.npc.includes(npc) || npcsDelJefe(r, principal).includes(npc)) {
        return { raid: id, npc: principal, ruta: `/guias/${id}/${principal}` };
      }
    }
  }
  return null;
}

/** Lo que se le manda a la IA de la guía de ese jefe: sus mecánicas, en español (null si no tiene ficha). */
export function guiaParaIA(npc: number) {
  const j = jefeEnGuia(npc);
  const f = j ? raidGuia(j.raid)?.jefes[j.npc]?.es : null;
  if (!f) return null;
  return {
    mecanicas: f.mecanicas.map((m) => ({ titulo: m.titulo, que_hacer: m.como, hace_wipe: m.wipe, en_datos: m.en_datos, ataques: m.ataques.map(String) })),
  };
}

// ── Mantenimiento (fase 8) ──────────────────────────────────────────────────────────────────────────────

/** Parches que tocan esa raid y son posteriores a `desde` (la fecha de parche de una ficha), del más antiguo al más nuevo. */
export const parchesPosteriores = (raid: string, desde: string) =>
  C.parches.filter((p) => p.raids.includes(raid) && p.fecha > desde).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
