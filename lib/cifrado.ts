// Cifrado de secretos guardados en la base (el webhook de Discord de cada grupo): AES-256-GCM con una clave derivada
// de AUTH_SECRET por HKDF, con su propia etiqueta, así que no hace falta otra variable de entorno. Si AUTH_SECRET
// cambia, los webhooks guardados dejan de descifrarse (descifrar devuelve null) y hay que volver a pegarlos en Ajustes.
// Formato: «v1.<iv>.<tag>.<cifrado>» en base64url.
import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

function clave(): Buffer {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) throw new Error('Falta AUTH_SECRET');
  return Buffer.from(hkdfSync('sha256', secreto, 'dps-aion', 'secretos-de-grupo v1', 32));
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), datos].map((x) => (typeof x === 'string' ? x : x.toString('base64url'))).join('.');
}

/** El texto en claro, o null si no se puede descifrar (otra clave, formato desconocido o datos alterados). */
export function descifrar(cifrado: string): string | null {
  const [v, iv, tag, datos] = cifrado.split('.');
  if (v !== 'v1' || !iv || !tag || datos === undefined) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
