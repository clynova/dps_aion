// PUT /api/v1/grupos/:grupo/jugadores/:slug/perfil/:idioma — el perfil escrito por Claude de un jugador, para ese grupo
// (lo que era jugadores/<slug>/perfil.json / .en.json). Lo escriben un admin del grupo o el token del grupo, y solo
// para jugadores que salen en alguna raid del grupo.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { error, json, llamante } from '@/lib/api/autenticar';
import { db } from '@/lib/db/client';
import { grupoPorSlug } from '@/lib/db/grupos';
import { auditoria, jugadores, perfilTexto, raidJugador, raids } from '@/lib/db/schema';
import { esIdioma } from '@/lib/i18n';
import { esquemaPerfil } from '@/lib/ingest/perfil';
import { puede } from '@/lib/permisos';

export async function PUT(req: Request, ctx: RouteContext<'/api/v1/grupos/[grupo]/jugadores/[slug]/perfil/[idioma]'>) {
  const { grupo: g, slug, idioma } = await ctx.params;
  if (!esIdioma(idioma)) return error(404, 'idioma');
  const grupo = await grupoPorSlug(g);
  if (!grupo) return error(404, 'grupo');
  const quien = await llamante(req, grupo.id);
  if (!quien.rol) return error(401, 'sin-autenticar');
  if (!quien.porToken && !puede(quien.rol, 'ajustes')) return error(403, 'sin-permiso');
  const [j] = await db.selectDistinct({ id: jugadores.id }).from(jugadores)
    .innerJoin(raidJugador, eq(raidJugador.jugadorId, jugadores.id))
    .innerJoin(raids, eq(raids.id, raidJugador.raidId))
    .where(and(eq(jugadores.slug, slug), eq(raids.grupoId, grupo.id))).limit(1);
  if (!j) return error(404, 'jugador');
  const v = esquemaPerfil.safeParse(await req.json().catch(() => null));
  if (!v.success) return error(422, 'formato', { problemas: v.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`) });
  await db.transaction(async (tx) => {
    await tx.delete(perfilTexto).where(and(eq(perfilTexto.jugadorId, j.id), eq(perfilTexto.grupoId, grupo.id), eq(perfilTexto.idioma, idioma)));
    await tx.insert(perfilTexto).values({ jugadorId: j.id, grupoId: grupo.id, idioma, contenido: v.data, raids: v.data.raids });
    await tx.insert(auditoria).values({ grupoId: grupo.id, usuarioId: quien.usuarioId, accion: 'perfil.escribir', ref: `${slug}/${idioma}` });
  });
  revalidatePath('/[lang]/jugadores/[slug]', 'page');
  revalidatePath('/[lang]/g/[grupo]', 'layout');
  return json({ ok: true });
}
