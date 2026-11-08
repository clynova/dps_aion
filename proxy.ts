// Antes de cada página: idioma (ver lib/i18n/ruta-idioma.ts). Las API y los archivos estáticos no pasan por aquí.
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_IDIOMA, decidirIdioma } from '@/lib/i18n/ruta-idioma';

const UN_ANO = 60 * 60 * 24 * 365;

export function proxy(request: NextRequest) {
  const d = decidirIdioma({
    ruta: request.nextUrl.pathname,
    query: request.nextUrl.searchParams,
    cookie: request.cookies.get(COOKIE_IDIOMA)?.value,
    acceptLanguage: request.headers.get('accept-language'),
  });
  if (d.tipo === 'seguir') return NextResponse.next();
  if (d.tipo === 'reescribir') {
    const url = request.nextUrl.clone(); url.pathname = d.ruta;
    return NextResponse.rewrite(url);
  }
  const res = NextResponse.redirect(new URL(d.ruta, request.url));
  if (d.guardar) res.cookies.set(COOKIE_IDIOMA, d.guardar, { path: '/', maxAge: UN_ANO, sameSite: 'lax' });
  return res;
}

export const config = {
  // Todo menos API, internos de Next y archivos con extensión (favicon.ico, .json, .png…)
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
