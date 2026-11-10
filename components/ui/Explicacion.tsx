// Subtítulo de una tarjeta en una línea y, plegado debajo, cómo se calcula (docs/plan-ui.md: «el método, plegado»).
// Sin JavaScript: un <details> nativo.
import type { ReactNode } from 'react';
import type { Traductor } from '@/lib/i18n';

export default function Explicacion({ t, corto, metodo }: { t: Traductor; corto: ReactNode; metodo: ReactNode }) {
  return (
    <>
      <p className="rx-note">{corto}</p>
      <details className="rx-metodo">
        <summary>{t('ui.metodo')}</summary>
        <p>{metodo}</p>
      </details>
    </>
  );
}
