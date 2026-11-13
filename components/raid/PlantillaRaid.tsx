// Plantilla generada desde assets/raid-shell.html (web estática): la misma estructura e ids que espera lib/legado/*.
// Los textos salen traducidos del servidor; los datos los pinta el módulo de lib/legado al montar la página.
// Desde el 10/11/2026 (docs/plan-ui.md) va en pestañas: arriba, lo que hay que saber (titular, cifras y qué cambiar);
// debajo, una pestaña por tema. Cada panel es un `pl-panel` con el id de su pestaña, que va en el #hash.
import Link from 'next/link';
import type { ReactNode } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import type { Traductor } from '@/lib/i18n';

/** Pestañas de la raid, en orden. El id de cada una es el de su panel y el del #hash. */
export const PESTANAS_RAID = ['resumen', 'intentos', 'muertes', 'mecanicas', 'dano', 'jugadores', 'analisis'] as const;

/** `intentos`, `repaso`, `mecanicas`, `ventanas`, `builds` y `seguimiento` son secciones que llegan ya pintadas del servidor (components/raid/Intentos, Repaso, Mecanicas, Ventanas, Builds, Seguimiento); `resumenSeguimiento`, su línea para la cabecera. */
export default function PlantillaRaid({ t, volver, accion, enlaceJefe, enlaceGuia, intentos, repaso, mecanicas, ventanas, builds, seguimiento, resumenSeguimiento }: {
  t: Traductor; volver: string; accion?: ReactNode; enlaceJefe?: { href: string; texto: string } | null; enlaceGuia?: { href: string; texto: string } | null; intentos?: ReactNode; repaso?: ReactNode; mecanicas?: ReactNode; ventanas?: ReactNode; builds?: ReactNode; seguimiento?: ReactNode; resumenSeguimiento?: ReactNode;
}) {
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><Link className="rx-back" href={volver}>{t('raid.back')}</Link></BarraSuperior>
        <p className="rx-eyebrow" id="eyebrow">{t('raid.loading')}</p>
        <h1 className="rx-title" id="jefe">—</h1>
        <p className="rx-lede" id="lede"></p>
        <div className="rx-others" id="otros"></div>
        {enlaceJefe || enlaceGuia ? (
          <p className="cx-fila">
            {enlaceJefe ? <Link className="rx-link" href={enlaceJefe.href}>{enlaceJefe.texto} →</Link> : null}
            {enlaceGuia ? <Link className="rx-link" href={enlaceGuia.href}>{enlaceGuia.texto} →</Link> : null}
          </p>
        ) : null}
        {accion}
      </header>

      <section className="rx-tiles rx-tiles-cab" id="tiles"></section>

      {resumenSeguimiento}

      {/* «Soy…»: lo rellena lib/legado/raid.ts con los jugadores de la raid (docs/plan-ui.md, fase 4) */}
      <div className="rx-soy" id="soy-box" hidden>
        <label htmlFor="soy">{t('soy.label')}</label>
        <select className="cx-select" id="soy"></select>
        <span className="rx-note rx-soy-nota">{t('soy.nota')}</span>
      </div>

      <section className="rx-top" id="top" hidden>
        <h2 className="rx-top-t">{t('raid.top.t')}</h2>
        <ol className="rx-reco rx-top-lista" id="reco-top"></ol>
        <a className="rx-link" href="#analisis">{t('raid.top.todo')} →</a>
      </section>

      <nav className="pl-tabs rx-tabs" id="tabs" role="tablist" aria-label={t('raid.tabs.aria')}>
        {PESTANAS_RAID.map((p, i) => (
          <button key={p} type="button" role="tab" data-tab={p} aria-controls={p} aria-selected={i === 0} tabIndex={i === 0 ? 0 : -1}>
            {t(`raid.tab.${p}`)}
          </button>
        ))}
      </nav>

      <div className="pl-panel rx-panel" id="resumen" role="tabpanel">
        <article className="rx-card rx-mio" id="mio" hidden aria-live="polite">
          <div className="rx-ficha-head">
            <div>
              <p className="rx-eyebrow" id="mio-sub"></p>
              <h3 className="rx-ficha-name" id="mio-nombre"></h3>
            </div>
            <a className="rx-link" id="mio-ficha" href="#">{t('soy.ficha')} →</a>
          </div>
          <div className="rx-tiles" id="mio-tiles"></div>
          <p className="rx-note" id="mio-reco-pend" hidden>{t('f.reco.none')}</p>
          <ul className="rx-reco" id="mio-reco"></ul>
        </article>
        <div className="rx-grid">
          <article className="rx-card">
            <h3>{t('card.progress')}</h3>
            <p className="rx-note">{t('card.progress.note')}</p>
            <div className="rx-legend" data-zona="muro" hidden><span><i className="rx-key rx-key-band"></i><span>{t('legend.wall')}</span></span></div>
            <div className="rx-chart" id="ch-progreso"></div>
          </article>
          <article className="rx-card">
            <h3>{t('raid.dps.t')}</h3>
            <p className="rx-note">{t('raid.dps.nota')}</p>
            <div className="rx-chart" id="ch-dps-party"></div>
          </article>
        </div>
        <article className="rx-card">
          <h3>{t('card.causes')}</h3>
          <p className="rx-note">{t('card.causes.note')}</p>
          <div className="rx-legend"><span><i className="rx-key rx-key-critical"></i><span>{t('legend.oneshot')}</span></span><span><i className="rx-key rx-key-muted"></i><span>{t('legend.rest')}</span></span></div>
          <div className="rx-chart" id="ch-causas"></div>
        </article>
      </div>

      <div className="pl-panel rx-panel" id="intentos" role="tabpanel" hidden>
        <article className="rx-card">
          <h3>{t('card.curve')}</h3>
          <p className="rx-note">{t('card.curve.note')}</p>
          <div className="rx-legend" data-zona="ventana" hidden><span><i className="rx-key rx-key-band"></i><span>{t('legend.window')}</span></span></div>
          <div className="rx-chart" id="ch-curva"></div>
        </article>
        {intentos}
      </div>

      <div className="pl-panel rx-panel" id="muertes" role="tabpanel" hidden>
        <article className="rx-card">
          <h3>{t('card.casts')}</h3>
          <p className="rx-note">{t('card.casts.note')}</p>
          <div className="rx-chart" id="ch-casteos"></div>
        </article>
        {repaso}
      </div>

      <div className="pl-panel rx-panel" id="mecanicas" role="tabpanel" hidden>
        {mecanicas}
      </div>

      <div className="pl-panel rx-panel" id="dano" role="tabpanel" hidden>
        {ventanas}
        {builds}
      </div>

      <div className="pl-panel rx-panel" id="jugadores" role="tabpanel" hidden>
        <article className="rx-card">
          <h3>{t('card.table')}</h3>
          <p className="rx-note">{t('card.table.note')}</p>
          <div className="rx-table-wrap">
            <table className="rx-table">
              <thead>
                <tr>
                  <th>{t('th.player')}</th><th>{t('th.class')}</th><th className="rx-opt rx-left">{t('th.skills')}</th>
                  <th className="rx-opt">{t('th.gs')}</th><th>{t('th.dps')}</th><th>{t('th.hps')}</th>
                  <th className="rx-opt">{t('th.taken')}</th><th>{t('th.deaths')}</th>
                  <th className="rx-opt">{t('th.crit')}</th><th className="rx-opt">{t('th.back')}</th>
                </tr>
              </thead>
              <tbody id="tabla"></tbody>
            </table>
          </div>
        </article>
        <article className="rx-card rx-ficha" id="ficha" hidden aria-live="polite">
          <div className="rx-ficha-head">
            <div>
              <p className="rx-eyebrow" id="f-clase"></p>
              <h3 className="rx-ficha-name" id="f-nombre"></h3>
              <p className="rx-note" id="f-equipo"></p>
              <a className="rx-link" id="f-perfil" href="#">{t('pl.open')}</a>
            </div>
            <button type="button" className="rx-close" id="f-cerrar" aria-label={t('f.closeAria')}>{t('f.close')}</button>
          </div>
          <div className="rx-tiles" id="f-tiles"></div>
          <div className="rx-sub rx-f-reco">
            <h4>{t('f.reco')}</h4>
            <p className="rx-note" id="f-reco-pend" hidden>{t('f.reco.none')}</p>
            <ul className="rx-reco" id="f-reco"></ul>
          </div>
          <div className="rx-grid">
            <div className="rx-sub">
              <h4>{t('f.dps')}</h4>
              <p className="rx-note">{t('f.dps.note')}</p>
              <div className="rx-chart rx-chart-sm" id="f-dps"></div>
            </div>
            <div className="rx-sub">
              <h4>{t('f.skills')}</h4>
              <p className="rx-note">{t('f.skills.note')}</p>
              <div className="rx-chart rx-chart-sm" id="f-habilidades"></div>
            </div>
            <div className="rx-sub">
              <h4>{t('f.taken')}</h4>
              <p className="rx-note">{t('f.taken.note')}</p>
              <div className="rx-chart rx-chart-sm" id="f-recibido"></div>
            </div>
            <div className="rx-sub">
              <h4>{t('f.deaths')}</h4>
              <p className="rx-note">{t('f.deaths.note')}</p>
              <div className="rx-table-wrap rx-scroll">
                <table className="rx-table rx-table-sm">
                  <thead><tr><th>{t('f.th.try')}</th><th>{t('f.th.sec')}</th><th>{t('f.th.skill')}</th><th>{t('f.th.hit')}</th></tr></thead>
                  <tbody id="f-muertes"></tbody>
                </table>
              </div>
            </div>
          </div>
        </article>
        <article className="rx-card">
          <h3>{t('card.map')}</h3>
          <p className="rx-note">{t('card.map.note')}</p>
          <div className="rx-chart" id="ch-mapa"></div>
        </article>
      </div>

      <div className="pl-panel rx-panel" id="analisis" role="tabpanel" hidden>
        <section className="rx-section">
          <h2 className="rx-h2">{t('sec.analysis')}</h2>
          <p className="rx-pending" id="pendiente" hidden>{t('analysis.pending')}</p>
          <p className="rx-pending" id="solo-es" hidden>{t('analysis.onlyEs')}</p>
          <ol className="rx-reco" id="reco"></ol>
        </section>
        <section className="rx-section" id="reco-jug-sec" hidden>
          <h2 className="rx-h2">{t('raid.recoJug.t')}</h2>
          <p className="rx-note">{t('raid.recoJug.nota')}</p>
          <div className="rx-reco-jug" id="reco-jug"></div>
        </section>
        {seguimiento}
        <details className="rx-details">
          <summary>{t('notes.summary')}</summary>
          <dl id="notas"></dl>
        </details>
      </div>

      <p className="rx-foot" id="foot"></p>
    </main>
  );
}
