// Idiomas de la web. Los textos vienen de la web estática (assets/i18n.js → npm run textos) y conservan sus
// claves con puntos ('pl.chart.dps', 'pl.chart.dps.note'…): por eso el diccionario es plano y no se usa una
// librería que anide por puntos. Interpolación {var} igual que hoy. Ver docs/adr/0001-idiomas.md.
import es from './es.json';
import en from './en.json';

export const IDIOMAS = ['es', 'en'] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_DEFECTO: Idioma = 'es';
export type Clave = keyof typeof es;
export type Vars = Record<string, string | number>;

const DICCIONARIOS: Record<Idioma, Record<string, string>> = { es, en };

export const esIdioma = (s: string | null | undefined): s is Idioma => !!s && (IDIOMAS as readonly string[]).includes(s);

/** t(clave, vars): texto en el idioma pedido; si falta, el español; si tampoco existe, la propia clave. */
export function traductor(idioma: Idioma) {
  const d = DICCIONARIOS[idioma];
  return (clave: Clave, vars?: Vars): string => {
    let s = d[clave] ?? DICCIONARIOS.es[clave] ?? clave;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] != null ? String(vars[k]) : m));
    return s;
  };
}

/** Locale de Intl para formatear números y fechas (los mismos que la web actual). */
export const localeDe = (idioma: Idioma) => (idioma === 'es' ? 'es' : 'en');

/** Ruta pública de una página en un idioma: el español no lleva prefijo, el inglés va bajo /en. */
export function rutaEn(idioma: Idioma, ruta: string): string {
  const r = ruta.startsWith('/') ? ruta : `/${ruta}`;
  if (idioma === IDIOMA_DEFECTO) return r;
  return r === '/' ? `/${idioma}` : `/${idioma}${r}`;
}

/** Quita el prefijo de idioma (/en/raids/x → /raids/x). También /es: es la ruta interna tras la reescritura del
 *  proxy, y es lo que devuelve usePathname() en las páginas en español. */
export function sinIdioma(ruta: string): string {
  for (const i of IDIOMAS) {
    if (ruta === `/${i}`) return '/';
    if (ruta.startsWith(`/${i}/`)) return ruta.slice(i.length + 1);
  }
  return ruta;
}
