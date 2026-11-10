// Datos de las páginas de lectura (raid, grupo, perfil) con los permisos aplicados (lib/permisos.ts).
// Devuelven lo mismo que leían los scripts de la web estática (data.json, analisis.json, nombres.json, index.json),
// para que los módulos de lib/legado pinten exactamente lo mismo.
import 'server-only';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import * as t from '@/lib/db/schema';
import { construirPerfiles } from '@/lib/perfil/construir';
import { apareceEnListados, puedeVerRaid, type Rol, type Visibilidad } from '@/lib/permisos';
import type { Idioma } from '@/lib/i18n';
import { especializacionesDePerfil } from './especializaciones';
import { reconstruirRaid } from './reconstruir';

export type Nombres = { apodos: Record<string, string>; habilidades: Record<string, string>; npcs: Record<string, string>; iconos: Record<string, string> };

/** Como nombres.json / nombres.en.json: el idioma pedido y, si falta un nombre, el español. Apodos: los globales y los del grupo encima. */
export async function nombresPara(idioma: Idioma, grupoId: string | null = null): Promise<Nombres> {
  const [filas, apodos] = await Promise.all([
    db.select().from(t.nombres).where(inArray(t.nombres.idioma, idioma === 'es' ? ['es'] : ['es', idioma])),
    db.select().from(t.apodos).where(and(inArray(t.apodos.idioma, idioma === 'es' ? ['es'] : ['es', idioma]),
      grupoId ? or(isNull(t.apodos.grupoId), eq(t.apodos.grupoId, grupoId)) : isNull(t.apodos.grupoId))),
  ]);
  const N: Nombres = { apodos: {}, habilidades: {}, npcs: {}, iconos: {} };
  // primero el español y después el idioma pedido, que lo pisa
  for (const f of filas.sort((a, b) => (a.idioma === 'es' ? -1 : 1) - (b.idioma === 'es' ? -1 : 1))) {
    (f.tipo === 'npc' ? N.npcs : N.habilidades)[String(f.id)] = f.nombre;
    if (f.icono) N.iconos[String(f.id)] = f.icono;
  }
  const peso = (a: typeof apodos[number]) => (a.idioma === idioma ? 2 : 0) + (a.grupoId ? 1 : 0);
  for (const a of apodos.sort((x, y) => peso(x) - peso(y))) N.apodos[String(a.refId)] = a.apodo;
  return N;
}

/** Análisis de la raid como lo cargaba raid.js: el del idioma; si no hay, el español (soloEs) o «pendiente». */
async function analisisPara(raidId: string, idioma: Idioma) {
  const filas = await db.select().from(t.analisis).where(eq(t.analisis.raidId, raidId));
  const de = (i: Idioma) => filas.find((f) => f.idioma === i)?.contenido as Record<string, unknown> | undefined;
  const propio = de(idioma);
  if (propio) return { analisis: propio, soloEs: false };
  const es = de('es');
  if (es && idioma !== 'es') return { analisis: es, soloEs: !es.pendiente };
  return { analisis: es ?? { pendiente: true }, soloEs: false };
}

/** Una raid para su página, o null si no existe o quien mira no puede verla (privada y no es miembro). */
export async function raidParaVer(slugGrupo: string, slugRaid: string, rolDe: (grupoId: string) => Promise<Rol | null>, idioma: Idioma) {
  const [fila] = await db.select({ raid: t.raids, grupo: t.grupos }).from(t.raids).innerJoin(t.grupos, eq(t.grupos.id, t.raids.grupoId))
    .where(and(eq(t.grupos.slug, slugGrupo), eq(t.raids.slug, slugRaid))).limit(1);
  if (!fila) return null;
  const rol = await rolDe(fila.grupo.id);
  if (!puedeVerRaid(fila.raid.visibilidad, rol)) return null;
  const [datos, a, nombres, anterior] = await Promise.all([
    reconstruirRaid(fila.raid.id), analisisPara(fila.raid.id, idioma), nombresPara(idioma, fila.grupo.id),
    raidAnterior(fila.raid, idioma, (v) => apareceEnListados(v, fila.grupo.visible, rol)),
  ]);
  return { grupo: fila.grupo, raid: fila.raid, rol, datos: datos!, ...a, nombres, anterior };
}

/**
 * La raid anterior del mismo jefe en el mismo grupo, con su análisis (para el seguimiento de recomendaciones). En la
 * página solo vale una que quien mira vería en los listados: una raid «con enlace» no se descubre desde otra.
 */
export async function raidAnterior(raid: Pick<typeof t.raids.$inferSelect, 'grupoId' | 'npcJefe' | 'fecha'>, idioma: Idioma, visible: (v: Visibilidad) => boolean = () => true) {
  const filas = await db.select({ id: t.raids.id, slug: t.raids.slug, visibilidad: t.raids.visibilidad }).from(t.raids)
    .where(and(eq(t.raids.grupoId, raid.grupoId), eq(t.raids.npcJefe, raid.npcJefe), lt(t.raids.fecha, raid.fecha))).orderBy(desc(t.raids.fecha)).limit(20);
  const f = filas.find((r) => visible(r.visibilidad));
  if (!f) return null;
  const [datos, a] = await Promise.all([reconstruirRaid(f.id), analisisPara(f.id, idioma)]);
  return datos ? { slug: f.slug, datos, analisis: a.analisis } : null;
}

/** Raids que aparecen en la página del grupo: todas si es miembro; si no, solo las públicas (las «con enlace» no se listan). */
async function raidsListables(grupoId: string, rol: Rol | null, grupoVisible: boolean) {
  const filas = await db.select().from(t.raids).where(eq(t.raids.grupoId, grupoId)).orderBy(desc(t.raids.fecha));
  return filas.filter((r) => apareceEnListados(r.visibilidad, grupoVisible, rol));
}

/** Lo que mostraba la portada de la web estática, para un grupo: índice de raids (raids/index.json) y de jugadores. */
export async function grupoParaVer(grupo: typeof t.grupos.$inferSelect, rol: Rol | null, idioma: Idioma) {
  const raids = await raidsListables(grupo.id, rol, grupo.visible);
  const ids = raids.map((r) => r.id);
  const [otros, conAnalisis, nombres, datos] = await Promise.all([
    ids.length ? db.select().from(t.raidOtros).where(inArray(t.raidOtros.raidId, ids)) : [],
    ids.length ? db.select({ raidId: t.analisis.raidId, contenido: t.analisis.contenido }).from(t.analisis).where(and(inArray(t.analisis.raidId, ids), eq(t.analisis.idioma, 'es'))) : [],
    nombresPara(idioma, grupo.id),
    Promise.all(ids.map((id) => reconstruirRaid(id))),
  ]);
  const analizada = new Set(conAnalisis.filter((a) => !(a.contenido as { pendiente?: boolean }).pendiente).map((a) => a.raidId));
  const indiceRaids = raids.map((r) => ({
    slug: r.slug, fecha: (r.meta as { fecha: string }).fecha, jefe: r.jefe, npc: r.npcJefe, mazmorra: r.mazmorra,
    intentos: r.intentos, matado: r.matado, mejor_pct: r.mejorPct, muertes: r.muertesGrupo, dps_grupo_medio: r.dpsGrupoMedio,
    otros: otros.filter((o) => o.raidId === r.id).sort((a, b) => a.orden - b.orden).map((o) => ({ npc: o.npc, jefe: o.jefe, matado: o.matado })),
    analizado: analizada.has(r.id),
  }));
  const conPerfil = await slugsConPerfil(grupo.id);
  const { indice } = construirPerfiles(datos.filter(Boolean), conPerfil);
  return { raids: indiceRaids, jugadores: indice, nombres };
}

/**
 * Las raids de un grupo contra un jefe, para su página (lib/raids/jefe.ts), con los mismos permisos que la página del
 * grupo: todas si es miembro; si no, solo las públicas. null si no hay ninguna que quien mira pueda ver.
 */
export async function jefeParaVer(grupo: typeof t.grupos.$inferSelect, rol: Rol | null, npc: number, idioma: Idioma) {
  const raids = (await raidsListables(grupo.id, rol, grupo.visible)).filter((r) => r.npcJefe === npc);
  if (!raids.length) return null;
  const [datos, nombres] = await Promise.all([Promise.all(raids.map((r) => reconstruirRaid(r.id))), nombresPara(idioma, grupo.id)]);
  const lista = raids.flatMap((r, k) => (datos[k] ? [{ slug: r.slug, fecha: (r.meta as { fecha: string }).fecha, datos: datos[k] }] : []));
  return { jefe: nombres.npcs[String(npc)] ?? raids[0].jefe ?? String(npc), raids: lista, nombres };
}

async function slugsConPerfil(grupoId: string | null) {
  const filas = await db.selectDistinct({ slug: t.jugadores.slug }).from(t.perfilTexto).innerJoin(t.jugadores, eq(t.jugadores.id, t.perfilTexto.jugadorId))
    .where(and(eq(t.perfilTexto.idioma, 'es'), grupoId ? eq(t.perfilTexto.grupoId, grupoId) : sql`true`));
  return new Set(filas.map((f) => f.slug));
}

/**
 * Perfil de un jugador con las raids que quien mira puede ver en listados (públicas de grupos visibles y todas las de
 * sus grupos). El índice para comparar equipo (GS) se calcula sobre ese mismo conjunto, como hacía la web estática.
 */
export async function perfilParaVer(slugJugador: string, gruposDelUsuario: Map<string, Rol>, idioma: Idioma) {
  const [jug] = await db.select().from(t.jugadores).where(eq(t.jugadores.slug, slugJugador)).limit(1);
  if (!jug) return null;
  const todas = await db.select({ id: t.raids.id, slug: t.raids.slug, visibilidad: t.raids.visibilidad, grupoId: t.raids.grupoId, grupoSlug: t.grupos.slug, grupoVisible: t.grupos.visible })
    .from(t.raids).innerJoin(t.grupos, eq(t.grupos.id, t.raids.grupoId));
  const visibles = todas.filter((r) => apareceEnListados(r.visibilidad, r.grupoVisible, gruposDelUsuario.get(r.grupoId) ?? null));
  const suyas = new Set((await db.select({ raidId: t.raidJugador.raidId }).from(t.raidJugador).where(eq(t.raidJugador.jugadorId, jug.id))).map((r) => r.raidId));
  if (!visibles.some((r) => suyas.has(r.id))) return null;
  const crudos = await Promise.all(visibles.map((r) => reconstruirRaid(r.id)));
  const datos = crudos.filter(Boolean);
  const gruposVisibles = [...new Set(visibles.map((r) => r.grupoId))];
  const [nombres, conPerfil, textos] = await Promise.all([
    nombresPara(idioma, gruposVisibles.length === 1 ? gruposVisibles[0] : null),
    slugsConPerfil(null),
    db.select().from(t.perfilTexto).where(and(eq(t.perfilTexto.jugadorId, jug.id), inArray(t.perfilTexto.grupoId, gruposVisibles.length ? gruposVisibles : ['00000000-0000-0000-0000-000000000000'])))
      .orderBy(desc(t.perfilTexto.actualizado)),
  ]);
  const { perfiles, indice } = construirPerfiles(datos, conPerfil);
  const perfil = perfiles[jug.nombre];
  if (!perfil) return null;
  const perfilClaude = (textos.find((x) => x.idioma === idioma) ?? textos.find((x) => x.idioma === 'es'))?.contenido ?? null;
  const grupoDeRaid = Object.fromEntries(visibles.map((r) => [r.slug, r.grupoSlug]));
  // Sus especializaciones frente a las de los demás de su clase en esas mismas raids (lib/raids/especializaciones.ts)
  const especializaciones = especializacionesDePerfil(visibles.flatMap((r, k) => (crudos[k] ? [{ slug: r.slug, fecha: (crudos[k].meta as { fecha: string }).fecha, datos: crudos[k] }] : [])), jug.nombre);
  return { jugador: jug, datos: { ...perfil, actualizado: new Date().toISOString() }, perfilClaude, nombres, indice, grupoDeRaid, especializaciones };
}
