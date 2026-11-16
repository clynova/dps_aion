// POST /api/v1/grupos/:grupo/raids/:slug/toxico — hace la pestaña «Sin filtro» de una raid, o la rehace si ya la
// tiene (como mucho una vez por hora: 429 con «disponible»). Publicador o más, con el grupo activo y un análisis
// principal. No toca el análisis principal ni su espera de 24 h. GET: { hecho, actualizado }.
import { and, eq } from 'drizzle-orm';
import { after } from 'next/server';
import { error, json, llamante } from '@/lib/api/autenticar';
import { iaConfigurada } from '@/lib/analisis/deepseek';
import { analizarToxico } from '@/lib/analisis/ia';
import { db } from '@/lib/db/client';
import { grupoPorSlug } from '@/lib/db/grupos';
import { analisisToxico } from '@/lib/db/schema';
import { puede } from '@/lib/permisos';
import { raidPorSlug } from '@/lib/raids/reconstruir';

export const maxDuration = 300;
/** Entre dos «Rehacer» de la misma raid */
const ESPERA_MS = 60 * 60_000;
type Ctx = RouteContext<'/api/v1/grupos/[grupo]/raids/[slug]/toxico'>;

async function preparar(req: Request, ctx: Ctx) {
  const { grupo: g, slug } = await ctx.params;
  const grupo = await grupoPorSlug(g);
  if (!grupo) return { fallo: error(404, 'grupo') };
  const quien = await llamante(req, grupo.id);
  if (!quien.rol) return { fallo: error(401, 'sin-autenticar') };
  if (!puede(quien.rol, 'subir_raid')) return { fallo: error(403, 'sin-permiso') };
  if (!grupo.toxico) return { fallo: error(409, 'apagado') };
  const raid = await raidPorSlug(grupo.id, slug);
  if (!raid) return { fallo: error(404, 'raid') };
  const [ya] = await db.select({ actualizado: analisisToxico.actualizado }).from(analisisToxico)
    .where(and(eq(analisisToxico.raidId, raid.id), eq(analisisToxico.idioma, 'es')));
  return { raid, quien, actualizado: ya ? new Date(ya.actualizado) : null };
}

export async function GET(req: Request, ctx: Ctx) {
  const p = await preparar(req, ctx);
  if ('fallo' in p) return p.fallo;
  return json({ hecho: !!p.actualizado, actualizado: p.actualizado?.toISOString() ?? null });
}

export async function POST(req: Request, ctx: Ctx) {
  const p = await preparar(req, ctx);
  if ('fallo' in p) return p.fallo;
  if (!iaConfigurada()) return error(503, 'ia-no-configurada');
  if (p.actualizado && Date.now() - p.actualizado.getTime() < ESPERA_MS) {
    return error(429, 'espera', { disponible: new Date(p.actualizado.getTime() + ESPERA_MS).toISOString() });
  }
  after(() => analizarToxico(p.raid.id, { forzar: !!p.actualizado, usuarioId: p.quien.usuarioId })
    .then((r) => { if (!r.ok) console.error('toxico ia:', r.motivo); })
    .catch((e) => console.error('toxico ia:', e instanceof Error ? e.message : e)));
  return json({ ok: true, estado: 'en-curso' }, 202);
}
