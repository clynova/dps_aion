// Compatibilidad: las URL de la web estática (/raids/<slug>/, también las ya compartidas en Discord) llevan con un
// 308 de verdad a la raid en su grupo (/g/<grupo>/raids/<slug>). Es un route handler y no una página para que el
// código de estado sea 308 (en una página con streaming ya se habría enviado un 200). El #Jugador lo conserva el navegador.
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { grupos, raids } from '@/lib/db/schema';
import { esIdioma, rutaEn } from '@/lib/i18n';

export async function GET(req: Request, { params }: RouteContext<'/[lang]/raids/[slug]'>) {
  const { lang, slug } = await params;
  // Si dos grupos tuvieran el mismo slug, gana la pública y, a igualdad, la más antigua (la de la web estática)
  const [r] = await db.select({ grupo: grupos.slug }).from(raids).innerJoin(grupos, eq(grupos.id, raids.grupoId))
    .where(eq(raids.slug, slug)).orderBy(sql`(${raids.visibilidad} = 'publica') desc`, asc(raids.publicado)).limit(1);
  const idioma = esIdioma(lang) ? lang : 'es';
  if (!r) return Response.redirect(new URL(rutaEn(idioma, '/'), req.url), 307);
  return Response.redirect(new URL(rutaEn(idioma, `/g/${r.grupo}/raids/${slug}`), req.url), 308);
}
