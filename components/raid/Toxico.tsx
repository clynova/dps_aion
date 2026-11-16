// Pestaña «Sin filtro» de la raid (docs/plan-toxico.md): el aviso rojo, el titular y, por jugador, sus pullas y cómo
// dejar de hacerlo. Sale del servidor; los ids se cambian por «nombre» y **x** por negrita, como en el análisis.
import type { ReactNode } from 'react';
import NombreJugador from '@/components/raid/NombreJugador';
import { localeDe, type Idioma, type Traductor } from '@/lib/i18n';
import type { Toxico as ToxicoDatos } from '@/lib/ingest/toxico';

type NombresHab = { apodos: Record<string, string>; habilidades: Record<string, string>; npcs: Record<string, string> };
type Props = {
  t: Traductor; idioma: Idioma; nombres: NombresHab; datos: unknown;
  toxico: { contenido: ToxicoDatos | null; soloEs: boolean };
  /** El botón para hacerla, si quien mira puede (raid sin pestaña todavía) */
  boton?: ReactNode;
};

export default function Toxico({ t, idioma, nombres, datos, toxico, boton }: Props) {
  const nombre = (id: string) => nombres.apodos[id] || nombres.habilidades[id] || nombres.npcs[id];
  const conIds = (s: string) => s.replace(/\b\d{6,8}\b/g, (id) => (nombre(id) ? t('q.open') + nombre(id) + t('q.close') : id));
  /** El texto con sus **negritas** */
  const texto = (s: string): ReactNode => conIds(s).split(/\*\*(.+?)\*\*/g).map((x, i) => (i % 2 ? <strong key={i}>{x}</strong> : x));

  const aviso = (
    <div className="rx-tox-aviso" role="note">
      <p className="rx-tox-aviso-t"><span aria-hidden="true">⚠ </span>{t('tox.aviso.t')}</p>
      <p>{t('tox.aviso')}</p>
    </div>
  );
  const a = toxico.contenido;
  if (!a) return (<section className="rx-section">{aviso}<p className="rx-pending">{t('tox.pendiente')}</p>{boton}</section>);

  const d = datos as { meta?: { grupo?: string[] }; jugadores?: { jugador: string; clase?: string; dps?: number; muertes?: number }[] };
  const grupo = d.meta?.grupo ?? Object.keys(a.jugadores);
  const fila = (n: string) => d.jugadores?.find((j) => j.jugador === n);
  const compacto = new Intl.NumberFormat(localeDe(idioma), { notation: 'compact', maximumFractionDigits: 1 });
  // Primero quien más pullas se lleva; a igualdad, en el orden del grupo
  const orden = Object.keys(a.jugadores).sort((x, y) => (a.jugadores[y].pullas.length - a.jugadores[x].pullas.length) || (grupo.indexOf(x) - grupo.indexOf(y)));

  return (
    <section className="rx-section">
      {aviso}
      {toxico.soloEs ? <p className="rx-pending">{t('tox.soloEs')}</p> : null}
      <h2 className="rx-h2 rx-tox-h">{t('tox.t')}</h2>
      <p className="rx-tox-titular">{texto(a.titular)}</p>
      <div className="rx-tox-lista">
        {orden.map((n) => {
          const j = a.jugadores[n], f = fila(n);
          return (
            <article key={n} className="rx-card rx-tox-card" data-pullas={j.pullas.length}>
              <div className="rx-tox-cab">
                <h3><NombreJugador n={n} /></h3>
                {f ? <span className="rx-note">{[f.clase, t('tox.cifras', { m: f.muertes ?? 0, dps: compacto.format(f.dps ?? 0) })].filter(Boolean).join(' · ')}</span> : null}
              </div>
              <ul className="rx-tox-pullas">{j.pullas.map((p, i) => <li key={i}>{texto(p)}</li>)}</ul>
              <p className="rx-tox-mejora"><span>{t('tox.mejora')}</span> {texto(j.mejora)}</p>
            </article>
          );
        })}
      </div>
      {a.notas?.length ? (
        <details className="rx-details">
          <summary>{t('notes.summary')}</summary>
          <dl>{a.notas.map((x, i) => <div key={i}><dt>{x.termino}</dt><dd>{texto(x.texto)}</dd></div>)}</dl>
        </details>
      ) : null}
    </section>
  );
}
