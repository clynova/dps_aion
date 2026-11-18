// Qué significa cada columna de una tabla (CP, GS, DPS, HPS…), plegado bajo el «?» como «Cómo se calcula».
// Sin JavaScript: un <details> nativo. `Sigla` pone el significado corto al pasar el ratón por la cabecera.
import type { Traductor } from '@/lib/i18n';

const CORTO = { cp: 'glos.cp.corto', gs: 'glos.gs.corto', dps: 'glos.dps.corto', hps: 'glos.hps.corto' } as const;

/** Cabecera con sigla: subrayado de puntos y el significado en `title`. */
export function Sigla({ t, sigla, texto }: { t: Traductor; sigla: keyof typeof CORTO; texto: string }) {
  return <abbr className="rx-sigla" title={t(CORTO[sigla])}>{texto}</abbr>;
}

/** Columnas que se pueden explicar: [clave de la cabecera, clave de la explicación]. */
export const COLUMNAS = {
  cp: ['th.cp', 'glos.cp'], gs: ['th.gs', 'glos.gs'], dps: ['th.dps', 'glos.dps'], hps: ['th.hps', 'glos.hps'],
  skills: ['th.skills', 'glos.skills'], taken: ['th.taken', 'glos.taken'], deaths: ['th.deaths', 'glos.deaths'],
  crit: ['th.crit', 'glos.crit'], back: ['th.back', 'glos.back'], rank: ['pl.th.rank', 'glos.rank'],
  first: ['pl.th.first', 'glos.first'], result: ['pl.th.result', 'glos.result'],
} as const;

export default function Glosario({ t, columnas }: { t: Traductor; columnas: (keyof typeof COLUMNAS)[] }) {
  return (
    <details className="rx-metodo rx-glosario">
      <summary>{t('glos.resumen')}</summary>
      <dl>
        {columnas.map((c) => (
          <div key={c}><dt>{t(COLUMNAS[c][0])}</dt><dd>{t(COLUMNAS[c][1])}</dd></div>
        ))}
      </dl>
    </details>
  );
}
