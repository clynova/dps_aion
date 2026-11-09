// Quién llama a la API y con qué rol en el grupo. Dos formas:
//  - Sesión de Discord (navegador): el rol es el de miembros.
//  - Token del grupo (Authorization: Bearer dps_…): para el PC (publicar.ps1) y Claude. Vale como «publicador» de ese
//    grupo y además puede escribir análisis y perfiles. En la base solo se guarda su SHA-256.
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { rolEn } from '@/lib/db/grupos';
import { tokensApi } from '@/lib/db/schema';
import type { Rol } from '@/lib/permisos';
import { hashToken } from '@/lib/tokens';

export { hashToken, nuevoToken } from '@/lib/tokens';

export type Llamante = { usuarioId: string | null; rol: Rol | null; porToken: boolean };


export async function llamante(req: Request, grupoId: string): Promise<Llamante> {
  const cabecera = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(dps_[A-Za-z0-9_-]{20,})$/.exec(cabecera.trim());
  if (m) {
    const [tok] = await db.select({ id: tokensApi.id, creadoPor: tokensApi.creadoPor }).from(tokensApi)
      .where(and(eq(tokensApi.hash, hashToken(m[1])), eq(tokensApi.grupoId, grupoId), eq(tokensApi.revocado, false))).limit(1);
    if (!tok) return { usuarioId: null, rol: null, porToken: false };
    await db.update(tokensApi).set({ ultimoUso: new Date() }).where(eq(tokensApi.id, tok.id));
    return { usuarioId: tok.creadoPor, rol: 'publicador', porToken: true };
  }
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return { usuarioId: null, rol: null, porToken: false };
  return { usuarioId: s.user.id, rol: await rolEn(grupoId, s.user.id), porToken: false };
}

export const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });
export const error = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);
