// Barra de arriba de todas las páginas: a la izquierda el contexto (eyebrow o «volver»), a la derecha el enlace a la
// guía de raids (/guias), la cuenta y ES | EN.
// La cuenta lee la sesión, así que va en <Suspense>: el resto de la página se sirve sin esperarla.
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import Cuenta from './cuenta/Cuenta';
import SelectorIdioma from './SelectorIdioma';
import { rutaEn } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';

export default async function BarraSuperior({ children }: { children?: ReactNode }) {
  const { t, idioma } = await textos();
  return (
    <div className="rx-topbar">
      <div>{children}</div>
      <div className="cx-derecha">
        <Link className="cx-nav" href={rutaEn(idioma, '/guias')}>{t('barra.raids')}</Link>
        <Suspense fallback={<span className="cx-cuenta" aria-hidden="true" />}>
          <Cuenta />
        </Suspense>
        <SelectorIdioma actual={idioma} etiqueta={t('lang.label')} />
      </div>
    </div>
  );
}
