// POST /api/v1/grupos/:grupo/raids — publicar (o actualizar) una raid: el JSON de db/raid.sql.
//   Autenticación: sesión de Discord con rol publicador+ o token del grupo (Bearer).
//   ?visibilidad=privada|enlace|publica (si no, la del grupo al crearla; al actualizar se conserva la que tenga).
//   Duplicados: si otra raid del grupo tiene la misma huella (misma noche grabada por otra persona) responde 409 con
//   su slug; ?reemplazar=1 borra esa y guarda esta.
import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { error, json, llamante } from '@/lib/api/autenticar';
import { db } from '@/lib/db/client';
import { grupoPorSlug } from '@/lib/db/grupos';
import { auditoria, raids } from '@/lib/db/schema';
import { validarRaid } from '@/lib/ingest/esquema';
import { guardarRaid } from '@/lib/ingest/guardar';
import { huellaRaid } from '@/lib/ingest/huella';
import { esVisibilidad, puede } from '@/lib/permisos';

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request, { params }: RouteContext<'/api/v1/grupos/[grupo]/raids'>) {
  const grupo = await grupoPorSlug((await params).grupo);
  if (!grupo) return error(404, 'grupo');
  const quien = await llamante(req, grupo.id);
  if (!quien.rol) return error(401, 'sin-autenticar');
  if (!puede(quien.rol, 'subir_raid')) return error(403, 'sin-permiso');

  const texto = await req.text();
  if (texto.length > MAX_BYTES) return error(413, 'demasiado-grande');
  let cuerpo: unknown;
  try { cuerpo = JSON.parse(texto); } catch { return error(400, 'json-invalido'); }
  const v = validarRaid(cuerpo);
  if (!v.ok) return error(422, 'formato', { problemas: v.problemas });

  const url = new URL(req.url);
  const vis = url.searchParams.get('visibilidad');
  if (vis !== null && !esVisibilidad(vis)) return error(400, 'visibilidad');

  const huella = huellaRaid(v.datos);
  const [dup] = await db.select({ id: raids.id, slug: raids.slug }).from(raids)
    .where(and(eq(raids.grupoId, grupo.id), eq(raids.huella, huella), ne(raids.slug, v.datos.meta.slug))).limit(1);
  if (dup) {
    if (url.searchParams.get('reemplazar') !== '1') return error(409, 'duplicada', { existente: dup.slug });
    await db.delete(raids).where(eq(raids.id, dup.id));
  }

  const g = await guardarRaid({ grupoId: grupo.id, datos: v.datos, origen: quien.porToken ? 'pc' : 'navegador', subidoPor: quien.usuarioId, visibilidad: vis ?? undefined });
  await db.insert(auditoria).values({ grupoId: grupo.id, usuarioId: quien.usuarioId, accion: g.nueva ? 'raid.subir' : 'raid.actualizar', ref: g.slug,
    detalle: { filas: g.filas, porToken: quien.porToken, ...(dup ? { reemplaza: dup.slug } : {}) } });
  revalidatePath('/[lang]/g/[grupo]', 'layout');
  return json({ ok: true, slug: g.slug, nueva: g.nueva, filas: g.filas, url: `/g/${grupo.slug}/raids/${g.slug}` }, g.nueva ? 201 : 200);
}
