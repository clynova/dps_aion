import { describe, expect, it } from 'vitest';
import es from '@/lib/i18n/es.json';
import en from '@/lib/i18n/en.json';
import { rutaEn, sinIdioma, traductor } from '@/lib/i18n';
import { decidirIdioma, idiomaDelNavegador } from '@/lib/i18n/ruta-idioma';

describe('diccionarios', () => {
  it('es y en tienen exactamente las mismas claves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
  it('cada texto usa las mismas variables {x} en los dos idiomas', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(es) as (keyof typeof es)[]) expect(vars(en[k]), k).toEqual(vars(es[k]));
  });
  it('ningún texto está vacío', () => {
    for (const [k, v] of [...Object.entries(es), ...Object.entries(en)]) expect(v.trim(), k).not.toBe('');
  });
});

describe('traductor', () => {
  it('interpola variables como la web actual', () => {
    expect(traductor('es')('pl.rank', { r: 2, n: 5 })).toBe('2.º de 5');
    expect(traductor('en')('pl.rank', { r: 2, n: 5 })).toBe('2 of 5');
  });
  it('deja intacta una variable que no se pasa', () => {
    expect(traductor('es')('pl.rank', { r: 2 })).toBe('2.º de {n}');
  });
  it('si la clave no existe devuelve la clave', () => {
    expect(traductor('en')('no.existe' as keyof typeof es)).toBe('no.existe');
  });
});

describe('rutas por idioma', () => {
  it('el español no lleva prefijo y el inglés va bajo /en', () => {
    expect(rutaEn('es', '/raids/x')).toBe('/raids/x');
    expect(rutaEn('en', '/raids/x')).toBe('/en/raids/x');
    expect(rutaEn('en', '/')).toBe('/en');
  });
  it('sinIdioma quita el prefijo', () => {
    expect(sinIdioma('/en/jugadores/cry')).toBe('/jugadores/cry');
    expect(sinIdioma('/en')).toBe('/');
    expect(sinIdioma('/raids/x')).toBe('/raids/x');
    expect(sinIdioma('/enlace')).toBe('/enlace');
    // ruta interna de las páginas en español (lo que da usePathname tras la reescritura)
    expect(sinIdioma('/es')).toBe('/');
    expect(sinIdioma('/es/raids/x')).toBe('/raids/x');
  });
});

describe('proxy de idioma', () => {
  const q = (s = '') => new URLSearchParams(s);
  it('sin prefijo y navegador en español: se sirve en español por dentro', () => {
    expect(decidirIdioma({ ruta: '/raids/x', query: q(), acceptLanguage: 'es-CL,es;q=0.9' })).toEqual({ tipo: 'reescribir', ruta: '/es/raids/x' });
    expect(decidirIdioma({ ruta: '/', query: q() })).toEqual({ tipo: 'reescribir', ruta: '/es' });
  });
  it('sin prefijo y navegador en otro idioma: redirige a inglés, como la web actual', () => {
    expect(decidirIdioma({ ruta: '/raids/x', query: q(), acceptLanguage: 'en-US,en;q=0.9' })).toEqual({ tipo: 'redirigir', ruta: '/en/raids/x' });
  });
  it('la elección guardada manda sobre el navegador', () => {
    expect(decidirIdioma({ ruta: '/', query: q(), cookie: 'es', acceptLanguage: 'en-US' })).toEqual({ tipo: 'reescribir', ruta: '/es' });
    expect(decidirIdioma({ ruta: '/', query: q(), cookie: 'en', acceptLanguage: 'es' })).toEqual({ tipo: 'redirigir', ruta: '/en' });
  });
  it('?lang= de los enlaces antiguos: guarda la elección y redirige sin el parámetro', () => {
    expect(decidirIdioma({ ruta: '/jugadores/cry/', query: q('lang=en') })).toEqual({ tipo: 'redirigir', ruta: '/en/jugadores/cry/', guardar: 'en' });
    expect(decidirIdioma({ ruta: '/en/jugadores/cry', query: q('lang=es&v=2') })).toEqual({ tipo: 'redirigir', ruta: '/jugadores/cry?v=2', guardar: 'es' });
  });
  it('/en se sirve tal cual y /es redirige a la ruta sin prefijo', () => {
    expect(decidirIdioma({ ruta: '/en/raids/x', query: q() })).toEqual({ tipo: 'seguir' });
    expect(decidirIdioma({ ruta: '/es/raids/x', query: q('a=1') })).toEqual({ tipo: 'redirigir', ruta: '/raids/x?a=1' });
  });
  it('idioma del navegador', () => {
    expect(idiomaDelNavegador(null)).toBe('es');
    expect(idiomaDelNavegador('*')).toBe('es');
    expect(idiomaDelNavegador('fr-FR,fr')).toBe('en');
  });
});
