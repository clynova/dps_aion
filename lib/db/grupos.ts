// Acceso a datos de grupos, miembros e invitaciones. Las comprobaciones de permisos se hacen aquí (lib/permisos.ts),
// no en las páginas: cada función recibe quién actúa y falla con ErrorPermiso si no puede.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { db } from './client';
import { auditoria, grupos, invitaciones, miembros, tokensApi, user } from './schema';
import { hashToken, nuevoToken } from '@/lib/tokens';
import {
  puede, puedeCambiarRol, puedeExpulsar, puedeInvitarCon, slugGrupoValido, type Rol, type Visibilidad,
} from '@/lib/permisos';

export class ErrorPermiso extends Error { constructor() { super('sin-permiso'); } }
export class ErrorDatos extends Error { constructor(public clave: string) { super(clave); } }

export type Grupo = typeof grupos.$inferSelect;

export async function grupoPorSlug(slug: string) {
  const [g] = await db.select().from(grupos).where(eq(grupos.slug, slug)).limit(1);
  return g ?? null;
}

export async function rolEn(grupoId: string, usuarioId: string | null | undefined): Promise<Rol | null> {
  if (!usuarioId) return null;
  const [m] = await db.select({ rol: miembros.rol }).from(miembros)
    .where(and(eq(miembros.grupoId, grupoId), eq(miembros.usuarioId, usuarioId))).limit(1);
  return m?.rol ?? null;
}

/** Grupo + rol de quien mira. Un grupo oculto solo existe para sus miembros (para el resto, null → 404). */
export async function grupoParaVer(slug: string, usuarioId: string | null) {
  const g = await grupoPorSlug(slug);
  if (!g) return null;
  const rol = await rolEn(g.id, usuarioId);
  if (!g.visible && !rol) return null;
  return { grupo: g, rol };
}

export async function gruposDeUsuario(usuarioId: string) {
  return db.select({ id: grupos.id, slug: grupos.slug, nombre: grupos.nombre, visible: grupos.visible, rol: miembros.rol })
    .from(miembros).innerJoin(grupos, eq(grupos.id, miembros.grupoId))
    .where(eq(miembros.usuarioId, usuarioId)).orderBy(asc(grupos.nombre));
}

export async function contarMiembros(grupoId: string) {
  const [r] = await db.select({ n: count() }).from(miembros).where(eq(miembros.grupoId, grupoId));
  return r?.n ?? 0;
}

export async function miembrosDe(grupoId: string) {
  return db.select({ usuarioId: miembros.usuarioId, nombre: user.name, imagen: user.image, rol: miembros.rol, desde: miembros.desde })
    .from(miembros).innerJoin(user, eq(user.id, miembros.usuarioId))
    .where(eq(miembros.grupoId, grupoId))
    .orderBy(sql`array_position(array['propietario','admin','publicador','miembro']::rol[], ${miembros.rol})`, asc(user.name));
}

export async function invitacionesActivas(grupoId: string) {
  return db.select().from(invitaciones)
    .where(and(eq(invitaciones.grupoId, grupoId), eq(invitaciones.revocada, false),
      sql`(${invitaciones.caduca} is null or ${invitaciones.caduca} > now())`,
      sql`(${invitaciones.usosMax} is null or ${invitaciones.usos} < ${invitaciones.usosMax})`))
    .orderBy(desc(invitaciones.creada));
}

/** Crea el grupo y pone a quien lo crea como propietario, en una transacción. */
export async function crearGrupo(usuarioId: string, nombre: string, slug: string) {
  nombre = nombre.trim();
  if (nombre.length < 2 || nombre.length > 60) throw new ErrorDatos('nombre');
  if (!slugGrupoValido(slug)) throw new ErrorDatos('slug');
  return db.transaction(async (tx) => {
    const [g] = await tx.insert(grupos).values({ nombre, slug, creadoPor: usuarioId }).onConflictDoNothing({ target: grupos.slug }).returning();
    if (!g) throw new ErrorDatos('slug-ocupado');
    await tx.insert(miembros).values({ grupoId: g.id, usuarioId, rol: 'propietario' });
    await tx.insert(auditoria).values({ grupoId: g.id, usuarioId, accion: 'grupo.crear', ref: slug });
    return g;
  });
}

export async function actualizarAjustes(actorId: string, grupoId: string, cambios: { nombre?: string; visible?: boolean; visibilidadDefecto?: Visibilidad }) {
  if (!puede(await rolEn(grupoId, actorId), 'ajustes')) throw new ErrorPermiso();
  if (cambios.nombre !== undefined) {
    cambios.nombre = cambios.nombre.trim();
    if (cambios.nombre.length < 2 || cambios.nombre.length > 60) throw new ErrorDatos('nombre');
  }
  await db.update(grupos).set(cambios).where(eq(grupos.id, grupoId));
  await db.insert(auditoria).values({ grupoId, usuarioId: actorId, accion: 'grupo.ajustes', detalle: cambios });
}

/** Código de invitación: 16 bytes aleatorios en base64url (no adivinable). */
const nuevoCodigo = () => randomBytes(16).toString('base64url');

export async function crearInvitacion(actorId: string, grupoId: string, opciones: { rol: Rol; dias: number | null; usosMax: number | null }) {
  const actor = await rolEn(grupoId, actorId);
  if (!puedeInvitarCon(actor, opciones.rol)) throw new ErrorPermiso();
  const caduca = opciones.dias ? new Date(Date.now() + opciones.dias * 86_400_000) : null;
  const [inv] = await db.insert(invitaciones).values({
    codigo: nuevoCodigo(), grupoId, rol: opciones.rol, caduca, usosMax: opciones.usosMax, creadaPor: actorId,
  }).returning();
  await db.insert(auditoria).values({ grupoId, usuarioId: actorId, accion: 'invitacion.crear', ref: inv.codigo.slice(0, 6), detalle: opciones });
  return inv;
}

export async function revocarInvitacion(actorId: string, grupoId: string, codigo: string) {
  if (!puede(await rolEn(grupoId, actorId), 'invitar')) throw new ErrorPermiso();
  await db.update(invitaciones).set({ revocada: true }).where(and(eq(invitaciones.codigo, codigo), eq(invitaciones.grupoId, grupoId)));
  await db.insert(auditoria).values({ grupoId, usuarioId: actorId, accion: 'invitacion.revocar', ref: codigo.slice(0, 6) });
}

/** Invitación con su grupo, si sigue siendo válida. */
export async function invitacionValida(codigo: string) {
  const [r] = await db.select({ inv: invitaciones, grupo: grupos }).from(invitaciones)
    .innerJoin(grupos, eq(grupos.id, invitaciones.grupoId))
    .where(and(eq(invitaciones.codigo, codigo), eq(invitaciones.revocada, false),
      sql`(${invitaciones.caduca} is null or ${invitaciones.caduca} > now())`,
      sql`(${invitaciones.usosMax} is null or ${invitaciones.usos} < ${invitaciones.usosMax})`)).limit(1);
  return r ?? null;
}

/**
 * Acepta una invitación: suma un uso y añade al usuario con el rol de la invitación. Si ya era miembro no cambia su
 * rol ni gasta un uso. El UPDATE condicionado evita que dos personas gasten a la vez el último uso.
 */
export async function aceptarInvitacion(usuarioId: string, codigo: string) {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invitaciones).where(eq(invitaciones.codigo, codigo)).limit(1);
    if (!inv) throw new ErrorDatos('invitacion');
    const [ya] = await tx.select({ rol: miembros.rol }).from(miembros).where(and(eq(miembros.grupoId, inv.grupoId), eq(miembros.usuarioId, usuarioId))).limit(1);
    const [g] = await tx.select({ slug: grupos.slug }).from(grupos).where(eq(grupos.id, inv.grupoId)).limit(1);
    if (ya) return { slug: g.slug, yaEra: true };
    const gastada = await tx.update(invitaciones).set({ usos: sql`${invitaciones.usos} + 1` })
      .where(and(eq(invitaciones.codigo, codigo), eq(invitaciones.revocada, false),
        sql`(${invitaciones.caduca} is null or ${invitaciones.caduca} > now())`,
        sql`(${invitaciones.usosMax} is null or ${invitaciones.usos} < ${invitaciones.usosMax})`)).returning({ codigo: invitaciones.codigo });
    if (!gastada.length) throw new ErrorDatos('invitacion');
    await tx.insert(miembros).values({ grupoId: inv.grupoId, usuarioId, rol: inv.rol });
    await tx.insert(auditoria).values({ grupoId: inv.grupoId, usuarioId, accion: 'miembro.unirse', ref: codigo.slice(0, 6), detalle: { rol: inv.rol } });
    return { slug: g.slug, yaEra: false };
  });
}

export async function cambiarRol(actorId: string, grupoId: string, objetivoId: string, nuevo: Rol) {
  const [actor, actual] = await Promise.all([rolEn(grupoId, actorId), rolEn(grupoId, objetivoId)]);
  if (!actual || !puedeCambiarRol(actor, actual, nuevo, actorId === objetivoId)) throw new ErrorPermiso();
  await db.update(miembros).set({ rol: nuevo }).where(and(eq(miembros.grupoId, grupoId), eq(miembros.usuarioId, objetivoId)));
  await db.insert(auditoria).values({ grupoId, usuarioId: actorId, accion: 'miembro.rol', ref: objetivoId, detalle: { de: actual, a: nuevo } });
}

export async function expulsar(actorId: string, grupoId: string, objetivoId: string) {
  const [actor, objetivo] = await Promise.all([rolEn(grupoId, actorId), rolEn(grupoId, objetivoId)]);
  if (!objetivo || !puedeExpulsar(actor, objetivo, actorId === objetivoId)) throw new ErrorPermiso();
  await db.delete(miembros).where(and(eq(miembros.grupoId, grupoId), eq(miembros.usuarioId, objetivoId)));
  await db.insert(auditoria).values({ grupoId, usuarioId: actorId, accion: actorId === objetivoId ? 'miembro.salir' : 'miembro.expulsar', ref: objetivoId });
}

/** Tokens activos del grupo (sin el hash). Solo para quien puede tocar los ajustes. */
export async function tokensDe(grupoId: string) {
  return db.select({ id: tokensApi.id, nombre: tokensApi.nombre, creado: tokensApi.creado, ultimoUso: tokensApi.ultimoUso })
    .from(tokensApi).where(and(eq(tokensApi.grupoId, grupoId), eq(tokensApi.revocado, false))).orderBy(desc(tokensApi.creado));
}

/** Crea un token de publicación y devuelve el token en claro (la única vez que existe fuera del PC de quien lo crea). */
export async function crearToken(actorId: string, grupoId: string, nombre: string) {
  if (!puede(await rolEn(grupoId, actorId), 'ajustes')) throw new ErrorPermiso();
  const n = nombre.trim();
  if (n.length < 1 || n.length > 60) throw new ErrorDatos('nombre');
  const token = nuevoToken();
  const [t] = await db.insert(tokensApi).values({ grupoId, nombre: n, hash: hashToken(token), creadoPor: actorId }).returning({ id: tokensApi.id });
  await db.insert(auditoria).values({ grupoId, usuarioId: actorId, accion: 'token.crear', ref: t.id, detalle: { nombre: n } });
  return token;
}

export async function revocarToken(actorId: string, grupoId: string, id: string) {
  if (!puede(await rolEn(grupoId, actorId), 'ajustes')) throw new ErrorPermiso();
  await db.update(tokensApi).set({ revocado: true }).where(and(eq(tokensApi.id, id), eq(tokensApi.grupoId, grupoId)));
  await db.insert(auditoria).values({ grupoId, usuarioId: actorId, accion: 'token.revocar', ref: id });
}

/** Cuántas raids tiene el grupo (para el aviso antes de borrarlo). */
export async function raidsDelGrupo(grupoId: string) {
  return (await db.execute<{ n: number }>(sql`select count(*)::int n from raids where grupo_id = ${grupoId}`)).rows[0].n;
}

/**
 * Borra el grupo con todo lo suyo: miembros, invitaciones, tokens, raids, análisis, perfiles y apodos del grupo (las
 * claves foráneas van en cascada). Solo el propietario, y escribiendo la dirección del grupo para confirmar. Los
 * jugadores que se quedan sin ninguna raid en ningún grupo también se borran. No se puede deshacer.
 */
export async function borrarGrupo(actorId: string, grupoId: string, confirmacion: string) {
  if (!puede(await rolEn(grupoId, actorId), 'borrar_grupo')) throw new ErrorPermiso();
  const [g] = await db.select({ slug: grupos.slug, nombre: grupos.nombre }).from(grupos).where(eq(grupos.id, grupoId));
  if (!g) throw new ErrorPermiso();
  if (confirmacion.trim().toLowerCase() !== g.slug) throw new ErrorDatos('confirmacion');
  await db.transaction(async (tx) => {
    const [{ raids }] = (await tx.execute<{ raids: number }>(sql`select count(*)::int raids from raids where grupo_id = ${grupoId}`)).rows;
    await tx.delete(grupos).where(eq(grupos.id, grupoId));
    await tx.execute(sql`delete from jugadores j where not exists (select 1 from raid_jugador rj where rj.jugador_id = j.id)`);
    // El registro queda sin grupo (el grupo ya no existe), con su dirección y nombre
    await tx.insert(auditoria).values({ grupoId: null, usuarioId: actorId, accion: 'grupo.borrar', ref: g.slug, detalle: { nombre: g.nombre, raids } });
  });
}
