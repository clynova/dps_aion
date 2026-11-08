// Decide qué hacer con cada petición según el idioma (lo usa proxy.ts). Función pura para poder probarla.
//  - /en/...           → se sirve tal cual (la carpeta app/[lang] recibe lang = 'en')
//  - /es/...           → redirige a la ruta sin prefijo (el español no lo lleva)
//  - ?lang=en|es       → compatibilidad con los enlaces de la web actual: guarda la elección y redirige sin el parámetro
//  - sin prefijo       → español por dentro (reescribe a /es/...), salvo que la persona haya elegido inglés
//                        (cookie) o, sin elección, que su navegador no esté en español (como hace la web actual)
import { IDIOMA_DEFECTO, IDIOMAS, esIdioma, rutaEn, sinIdioma, type Idioma } from './index';

export const COOKIE_IDIOMA = 'lang';

export type Decision =
  | { tipo: 'seguir' }
  | { tipo: 'reescribir'; ruta: string }
  | { tipo: 'redirigir'; ruta: string; guardar?: Idioma };

export function idiomaDelNavegador(acceptLanguage: string | null): Idioma {
  const primero = (acceptLanguage || '').split(',')[0]?.trim().toLowerCase() || '';
  if (!primero || primero === '*') return IDIOMA_DEFECTO;
  return primero.startsWith('es') ? 'es' : 'en';
}

export function decidirIdioma(entrada: { ruta: string; query: URLSearchParams; cookie?: string | null; acceptLanguage?: string | null }): Decision {
  const { ruta, query } = entrada;
  const param = query.get('lang');
  if (esIdioma(param)) {
    const resto = new URLSearchParams(query); resto.delete('lang');
    const qs = resto.toString();
    const base = rutaEn(param, sinIdioma(ruta));
    return { tipo: 'redirigir', ruta: qs ? `${base}?${qs}` : base, guardar: param };
  }
  const prefijo = IDIOMAS.find((i) => ruta === `/${i}` || ruta.startsWith(`/${i}/`));
  if (prefijo === IDIOMA_DEFECTO) {
    const qs = query.toString();
    const base = sinIdioma(ruta);
    return { tipo: 'redirigir', ruta: qs ? `${base}?${qs}` : base };
  }
  if (prefijo) return { tipo: 'seguir' };
  const elegido = esIdioma(entrada.cookie) ? entrada.cookie : idiomaDelNavegador(entrada.acceptLanguage ?? null);
  if (elegido !== IDIOMA_DEFECTO) {
    const qs = query.toString();
    const base = rutaEn(elegido, ruta);
    return { tipo: 'redirigir', ruta: qs ? `${base}?${qs}` : base };
  }
  return { tipo: 'reescribir', ruta: ruta === '/' ? `/${IDIOMA_DEFECTO}` : `/${IDIOMA_DEFECTO}${ruta}` };
}
