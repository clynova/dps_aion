// Tokens de publicación del grupo (para publicar.ps1 y Claude). En la base solo se guarda su SHA-256.
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
/** Token nuevo: «dps_» + 32 bytes aleatorios. Se muestra una sola vez; en la base va su hash. */
export const nuevoToken = () => `dps_${randomBytes(32).toString('base64url')}`;
