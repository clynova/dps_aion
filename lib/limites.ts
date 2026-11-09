// Límites de uso por grupo (fase 10) y quién administra la web. Los brutos de Questlog no se suben (se calculan en el
// navegador o en el PC), así que el único volumen que crece es el de raids: 60 raids NUEVAS cada 30 días por grupo
// (actualizar o reemplazar una ya subida no cuenta). Se cuentan en `auditoria` ('raid.subir'), que no se borra al
// borrar una raid: borrar y volver a subir no sirve para saltarse el límite.
import 'server-only';
import { and, count, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { account, auditoria } from '@/lib/db/schema';

export const LIMITE_RAIDS = 60;
export const VENTANA_DIAS = 30;

/** Raids nuevas del grupo en la ventana, y cuándo se libera la siguiente plaza si está lleno. */
export async function usoRaids(grupoId: string): Promise<{ usadas: number; limite: number; libre: Date | null }> {
  const desde = new Date(Date.now() - VENTANA_DIAS * 86_400_000);
  const filtro = and(eq(auditoria.grupoId, grupoId), eq(auditoria.accion, 'raid.subir'), gt(auditoria.creada, desde));
  const [{ n }] = await db.select({ n: count() }).from(auditoria).where(filtro);
  if (n < LIMITE_RAIDS) return { usadas: n, limite: LIMITE_RAIDS, libre: null };
  // La plaza que se libera antes es la de la subida número (n − límite + 1) por antigüedad
  const [fila] = await db.select({ creada: auditoria.creada }).from(auditoria).where(filtro)
    .orderBy(auditoria.creada).offset(n - LIMITE_RAIDS).limit(1);
  return { usadas: n, limite: LIMITE_RAIDS, libre: fila ? new Date(+fila.creada + VENTANA_DIAS * 86_400_000) : null };
}

/**
 * Administradores de la web (ven /admin/uso): SITE_ADMINS con ids separados por comas. Vale el id de Discord (en
 * Discord: Ajustes → Avanzado → Modo desarrollador, y «Copiar ID de usuario» en tu perfil) o el id de la tabla `user`.
 */
export async function esAdminSitio(usuarioId: string | null | undefined): Promise<boolean> {
  const ids = (process.env.SITE_ADMINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!usuarioId || !ids.length) return false;
  if (ids.includes(usuarioId)) return true;
  const [c] = await db.select({ id: account.accountId }).from(account)
    .where(and(eq(account.userId, usuarioId), eq(account.providerId, 'discord'))).limit(1);
  return !!c && ids.includes(c.id);
}
