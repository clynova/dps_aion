// Plantilla generada desde assets/jugador-shell.html (web estática): la misma estructura e ids que espera lib/legado/*.
// Los textos salen traducidos del servidor; los datos los pinta el módulo de lib/legado al montar la página.
import Link from 'next/link';
import type { ReactNode } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import type { Traductor } from '@/lib/i18n';

/** `especializaciones`: tarjeta del servidor (components/jugador/Especializaciones.tsx) dentro de la pestaña «Rotación». */
export default function PlantillaPerfil({ t, volver, especializaciones }: { t: Traductor; volver: string; especializaciones?: ReactNode }) {
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><Link className="rx-back" href={volver}>{t('pl.back')}</Link></BarraSuperior>
        <p className="rx-eyebrow" id="eyebrow">{t('raid.loading')}</p>
        <h1 className="rx-title" id="nombre">—</h1>
        <p className="rx-lede" id="lede"></p>
      </header>
    
      <section className="rx-tiles" id="tiles"></section>

      {/* Arriba, lo que dice su perfil en dos líneas y las 3 primeras recomendaciones (docs/plan-ui.md, fase 5) */}
      <section className="rx-top" id="pl-top" hidden>
        <h2 className="rx-top-t">{t('pl.top.t')}</h2>
        <p className="pl-summary" id="pl-top-resumen"></p>
        <ol className="rx-reco rx-top-lista" id="pl-top-reco"></ol>
        <a className="rx-link" href="#perfil">{t('pl.top.todo')} →</a>
      </section>

      <nav className="pl-tabs rx-tabs" id="tabs" role="tablist" aria-label={t('pl.tabs.aria')}>
        <button type="button" role="tab" data-tab="perfil">{t('pl.tabs.perfil')}</button>
        <button type="button" role="tab" data-tab="evolucion">{t('pl.sec.evolution')}</button>
        <button type="button" role="tab" data-tab="supervivencia">{t('pl.tab.surv')}</button>
        <button type="button" role="tab" data-tab="apoyo">{t('pl.tab.support')}</button>
        <button type="button" role="tab" data-tab="dano">{t('pl.tab.damage')}</button>
        <button type="button" role="tab" data-tab="rotacion">{t('pl.tab.rotation')}</button>
        <button type="button" role="tab" data-tab="raids">{t('pl.sec.raids')}</button>
      </nav>
    
      {/* Perfil: el de Claude (fortalezas y qué mejorar en dos columnas, recomendaciones) y, como apoyo, el automático;
          sin análisis de Claude, el automático sale abierto */}
      <section className="rx-section pl-panel" id="perfil" role="tabpanel">
        <article className="rx-card" id="c-card">
          <h3>{t('pl.claude')}</h3>
          <p className="rx-note">{t('pl.claude.note')}</p>
          <p className="rx-pending" id="c-pending" hidden>{t('pl.claude.pending')}</p>
          <div id="c-body" className="pl-claude"></div>
        </article>
        <details className="rx-card pl-auto-det" id="a-det">
          <summary><h3>{t('pl.auto')}</h3> <span className="rx-note">{t('pl.auto.note')}</span></summary>
          <div className="pl-auto pl-cols">
            <div className="rx-sub"><h4 className="pl-good">{t('pl.strengths')}</h4><ul className="rx-reco" id="a-good"></ul></div>
            <div className="rx-sub"><h4 className="pl-bad">{t('pl.watch')}</h4><ul className="rx-reco" id="a-bad"></ul></div>
            <div className="rx-sub"><h4>{t('pl.trend')}</h4><ul className="rx-reco" id="a-trend"></ul></div>
          </div>
        </details>
      </section>

      <section className="rx-section pl-panel" id="evolucion" role="tabpanel" hidden>
        <div className="rx-grid">
          <article className="rx-card">
            <h3>{t('pl.chart.dps')}</h3>
            <p className="rx-note">{t('pl.chart.dps.note')}</p>
            <div className="rx-chart" id="ch-dps"></div>
          </article>
          <article className="rx-card">
            <h3>{t('pl.chart.surv')}</h3>
            <p className="rx-note">{t('pl.chart.surv.note')}</p>
            <div className="rx-chart" id="ch-surv"></div>
          </article>
        </div>
      </section>
    
      <section className="rx-section pl-panel" id="supervivencia" role="tabpanel" hidden>
        <p className="rx-pending" id="sv-pending" hidden>{t('pl.new.pending')}</p>
        <p className="rx-note" id="sv-scope"></p>
        <div className="rx-tiles" id="sv-tiles"></div>
        <div className="rx-grid">
          <article className="rx-card" id="sv-card-deaths">
            <h3>{t('pl.chart.deaths')}</h3>
            <p className="rx-note">{t('pl.chart.deaths.note')}</p>
            <div className="rx-chart" id="ch-deaths"></div>
          </article>
          <article className="rx-card">
            <h3>{t('pl.chart.causes')}</h3>
            <p className="rx-note">{t('pl.chart.causes.note')}</p>
            <div className="rx-legend"><span><i className="rx-key rx-key-critical"></i><span>{t('legend.oneshot')}</span></span><span><i className="rx-key rx-key-muted"></i><span>{t('legend.rest')}</span></span></div>
            <div className="rx-chart rx-chart-sm" id="ch-causes"></div>
          </article>
          <article className="rx-card" id="sv-card-mit">
            <h3>{t('pl.chart.mit')}</h3>
            <p className="rx-note">{t('pl.chart.mit.note')}</p>
            <div className="rx-chart rx-chart-sm" id="ch-mit"></div>
          </article>
        </div>
      </section>
    
      <section className="rx-section pl-panel" id="apoyo" role="tabpanel" hidden>
        <p className="rx-pending" id="ap-pending" hidden>{t('pl.new.pending')}</p>
        <p className="rx-note" id="ap-scope"></p>
        <div className="rx-tiles" id="ap-tiles"></div>
        <div className="rx-grid" id="ap-grid">
          <article className="rx-card">
            <h3>{t('pl.chart.heal')}</h3>
            <p className="rx-note">{t('pl.chart.heal.note')}</p>
            <div className="rx-chart rx-chart-sm" id="ch-heal"></div>
          </article>
          <article className="rx-card">
            <h3>{t('pl.chart.healto')}</h3>
            <p className="rx-note">{t('pl.chart.healto.note')}</p>
            <div className="rx-chart rx-chart-sm" id="ch-healto"></div>
          </article>
          <article className="rx-card" id="ap-card-buffs">
            <h3>{t('pl.chart.buffs')}</h3>
            <p className="rx-note">{t('pl.chart.buffs.note')}</p>
            <div className="rx-chart rx-chart-sm" id="ch-buffs"></div>
          </article>
        </div>
      </section>
    
      <section className="rx-section pl-panel" id="rotacion" role="tabpanel" hidden>
        <p className="rx-pending" id="ro-pending" hidden>{t('pl.new.pending')}</p>
        <p className="rx-note" id="ro-scope"></p>
        <div className="rx-tiles" id="ro-tiles"></div>
        <div className="rx-grid" id="ro-grid">
          <article className="rx-card">
            <h3>{t('pl.chart.casts')}</h3>
            <p className="rx-note">{t('pl.chart.casts.note')}</p>
            <div className="rx-chart rx-chart-sm" id="ch-casts"></div>
          </article>
        </div>
        {especializaciones}
      </section>
    
      <section className="rx-section pl-panel" id="dano" role="tabpanel" hidden>
        <div className="rx-grid">
          <article className="rx-card">
            <h3>{t('pl.chart.skills')}</h3>
            <p className="rx-note">{t('pl.chart.skills.note')}</p>
            <div className="rx-chart rx-chart-sm" id="ch-skills"></div>
          </article>
        </div>
      </section>
    
      <section className="rx-section pl-panel" id="raids" role="tabpanel" hidden>
        <article className="rx-card">
          <div className="rx-table-wrap">
            <table className="rx-table">
              <thead>
                <tr>
                  <th>{t('pl.th.date')}</th><th>{t('pl.th.boss')}</th><th className="rx-left">{t('pl.th.result')}</th>
                  <th>{t('th.dps')}</th><th className="rx-opt">{t('pl.th.rank')}</th><th>{t('th.hps')}</th>
                  <th>{t('th.deaths')}</th><th className="rx-opt">{t('pl.th.first')}</th><th className="rx-opt">{t('pl.th.gs')}</th>
                </tr>
              </thead>
              <tbody id="tabla"></tbody>
            </table>
          </div>
        </article>
      </section>
    
      <p className="rx-foot" id="foot"></p>
    </main>
  );
}
