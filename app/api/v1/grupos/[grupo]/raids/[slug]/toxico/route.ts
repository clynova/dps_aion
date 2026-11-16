// POST /api/v1/grupos/:grupo/raids/:slug/toxico — hace la pestaña «Sin filtro» de una raid que aún no la tiene (por
// ejemplo, las subidas antes de activarla). Publicador o más, con el grupo activo y un análisis principal; nunca
// rehace una que ya exista (eso va con «Analizar con IA», que tiene la espera de 24 h). GET: { hecho }.
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
  const [ya] = await db.select({ r: analisisToxico.raidId }).from(analisisToxico).where(and(eq(analisisToxico.raidId, raid.id), eq(analisisToxico.idioma, 'es')));
  return { raid, quien, hecho: !!ya };
}

export async function GET(req: Request, ctx: Ctx) {
  const p = await preparar(req, ctx);
  if ('fallo' in p) return p.fallo;
  return json({ hecho: p.hecho });
}

export async function POST(req: Request, ctx: Ctx) {
  const p = await preparar(req, ctx);
  if ('fallo' in p) return p.fallo;
  if (!iaConfigurada()) return error(503, 'ia-no-configurada');
  if (p.hecho) return error(409, 'ya-hecho');
  after(() => analizarToxico(p.raid.id, { forzar: false, usuarioId: p.quien.usuarioId })
    .then((r) => { if (!r.ok) console.error('toxico ia:', r.motivo); })
    .catch((e) => console.error('toxico ia:', e instanceof Error ? e.message : e)));
  return json({ ok: true, estado: 'en-curso' }, 202);
}
