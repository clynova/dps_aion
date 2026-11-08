// PUT /api/v1/grupos/:grupo/raids/:slug/analisis/:idioma — el análisis de Claude (lo que hoy es analisis.json / .en.json).
// Lo escriben un admin del grupo o el token del grupo (Claude publica con publicar.ps1).
import { esquemaAnalisis } from '@/lib/ingest/analisis';
import { revalidatePath } from 'next/cache';
import { error, json, llamante } from '@/lib/api/autenticar';
import { db } from '@/lib/db/client';
import { grupoPorSlug } from '@/lib/db/grupos';
import { analisis, auditoria } from '@/lib/db/schema';
import { esIdioma } from '@/lib/i18n';
import { puede } from '@/lib/permisos';
import { raidPorSlug } from '@/lib/raids/reconstruir';


export async function PUT(req: Request, ctx: RouteContext<'/api/v1/grupos/[grupo]/raids/[slug]/analisis/[idioma]'>) {
  const { grupo: g, slug, idioma } = await ctx.params;
  if (!esIdioma(idioma)) return error(404, 'idioma');
  const grupo = await grupoPorSlug(g);
  if (!grupo) return error(404, 'grupo');
  const quien = await llamante(req, grupo.id);
  if (!quien.rol) return error(401, 'sin-autenticar');
  if (!quien.porToken && !puede(quien.rol, 'ajustes')) return error(403, 'sin-permiso');
  const raid = await raidPorSlug(grupo.id, slug);
  if (!raid) return error(404, 'raid');
  const v = esquemaAnalisis.safeParse(await req.json().catch(() => null));
  if (!v.success) return error(422, 'formato', { problemas: v.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`) });
  await db.insert(analisis).values({ raidId: raid.id, idioma, contenido: v.data, autor: quien.porToken ? 'claude' : (quien.usuarioId ?? 'admin') })
    .onConflictDoUpdate({ target: [analisis.raidId, analisis.idioma], set: { contenido: v.data, actualizado: new Date() } });
  await db.insert(auditoria).values({ grupoId: grupo.id, usuarioId: quien.usuarioId, accion: 'analisis.escribir', ref: `${slug}/${idioma}` });
  revalidatePath('/[lang]/g/[grupo]', 'layout');
  return json({ ok: true });
}
