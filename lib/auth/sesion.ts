// Usuario actual en el servidor (capa de acceso a datos). Lee las cabeceras de la petición, así que quien lo use
// debe estar dentro de un <Suspense> (cacheComponents). cache() evita leer la sesión dos veces en la misma petición.
import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { auth } from './index';

export type Usuario = { id: string; nombre: string; imagen: string | null };

export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  // Antes de tocar la base: marca la petición como dinámica. Si no, cacheComponents intenta prerenderizarla y el
  // pool de Neon (que usa crypto.randomBytes) rompe el render («blocking-prerender-random»).
  await connection();
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  return { id: s.user.id, nombre: s.user.name, imagen: s.user.image ?? null };
});
