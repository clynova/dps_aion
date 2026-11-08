// Barra de arriba de todas las páginas: a la izquierda el contexto (eyebrow o «volver»), a la derecha la cuenta y ES | EN.
// La cuenta lee la sesión, así que va en <Suspense>: el resto de la página se sirve sin esperarla.
import { Suspense, type ReactNode } from 'react';
import Cuenta from './cuenta/Cuenta';
import SelectorIdioma from './SelectorIdioma';
import { textos } from '@/lib/i18n/servidor';

export default async function BarraSuperior({ children }: { children?: ReactNode }) {
  const { t, idioma } = await textos();
  return (
    <div className="rx-topbar">
      <div>{children}</div>
      <div className="cx-derecha">
        <Suspense fallback={<span className="cx-cuenta" aria-hidden="true" />}>
          <Cuenta />
        </Suspense>
        <SelectorIdioma actual={idioma} etiqueta={t('lang.label')} />
      </div>
    </div>
  );
}
