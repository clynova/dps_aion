// GET    /api/v1/grupos/:grupo/raids/:slug — la raid en formato data.json (según su visibilidad).
// PATCH  /api/v1/grupos/:grupo/raids/:slug — { visibilidad } (quien la subió o un admin).
// DELETE /api/v1/grupos/:grupo/raids/:slug — borrarla (quien la subió o un admin).
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { error, json, llamante } from '@/lib/api/autenticar';
import { db } from '@/lib/db/client';
import { grupoPorSlug } from '@/lib/db/grupos';
import { auditoria, raids } from '@/lib/db/schema';
import { esVisibilidad, puedeEditarRaid, puedeVerRaid } from '@/lib/permisos';
import { raidPorSlug, reconstruirRaid } from '@/lib/raids/reconstruir';

type Ctx = RouteContext<'/api/v1/grupos/[grupo]/raids/[slug]'>;

async function cargar(req: Request, ctx: Ctx) {
  const { grupo: g, slug } = await ctx.params;
  const grupo = await grupoPorSlug(g);
  // Un grupo oculto no existe para quien no es miembro (mismo criterio que las páginas)
  const quien = grupo ? await llamante(req, grupo.id) : null;
  if (!grupo || !quien || (!grupo.visible && !quien.rol)) return null;
  const raid = await raidPorSlug(grupo.id, slug);
  if (!raid || !puedeVerRaid(raid.visibilidad, quien.rol)) return null;
  return { grupo, raid, quien, esSuya: !!quien.usuarioId && raid.subidoPor === quien.usuarioId };
}

export async function GET(req: Request, ctx: Ctx) {
  const c = await cargar(req, ctx);
  if (!c) return error(404, 'raid');
  return json(await reconstruirRaid(c.raid.id));
}

export async function PATCH(req: Request, ctx: Ctx) {
  const c = await cargar(req, ctx);
  if (!c) return error(404, 'raid');
  if (!puedeEditarRaid(c.quien.rol, c.esSuya)) return error(403, 'sin-permiso');
  const cuerpo = await req.json().catch(() => null) as { visibilidad?: unknown } | null;
  if (!cuerpo || !esVisibilidad(cuerpo.visibilidad)) return error(400, 'visibilidad');
  await db.update(raids).set({ visibilidad: cuerpo.visibilidad }).where(and(eq(raids.id, c.raid.id)));
  await db.insert(auditoria).values({ grupoId: c.grupo.id, usuarioId: c.quien.usuarioId, accion: 'raid.visibilidad', ref: (await ctx.params).slug, detalle: { a: cuerpo.visibilidad } });
  revalidatePath('/[lang]/g/[grupo]', 'layout');
  return json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const c = await cargar(req, ctx);
  if (!c) return error(404, 'raid');
  if (!puedeEditarRaid(c.quien.rol, c.esSuya)) return error(403, 'sin-permiso');
  await db.delete(raids).where(eq(raids.id, c.raid.id));
  await db.insert(auditoria).values({ grupoId: c.grupo.id, usuarioId: c.quien.usuarioId, accion: 'raid.borrar', ref: (await ctx.params).slug });
  revalidatePath('/[lang]/g/[grupo]', 'layout');
  return json({ ok: true });
}
