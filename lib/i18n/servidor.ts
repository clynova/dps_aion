// Idioma de la petición en Server Components, sin pasarlo por props (lang es el parámetro raíz de app/[lang]).
import { lang } from 'next/root-params';
import { notFound } from 'next/navigation';
import { esIdioma, localeDe, traductor, type Idioma } from './index';

export async function idiomaActual(): Promise<Idioma> {
  const l = await lang();
  if (!esIdioma(l)) notFound();
  return l;
}

/** const { t, idioma, locale } = await textos(); */
export async function textos() {
  const idioma = await idiomaActual();
  return { idioma, locale: localeDe(idioma), t: traductor(idioma) };
}
