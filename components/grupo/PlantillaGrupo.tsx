// Plantilla de la página de un grupo: la portada de la web estática (index.html), con la misma estructura e ids que
// espera lib/legado/grupo.ts. Cabecera con el nombre del grupo y enlace a sus ajustes para los miembros.
import Link from 'next/link';
import BarraSuperior from '@/components/BarraSuperior';
import type { Traductor } from '@/lib/i18n';

type Props = { t: Traductor; nombre: string; eyebrow: string; enlaceAjustes?: { href: string; texto: string } | null };

export default function PlantillaGrupo({ t, nombre, eyebrow, enlaceAjustes }: Props) {
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><p className="rx-eyebrow">{eyebrow}</p></BarraSuperior>
        <h1 className="rx-title">{nombre}</h1>
        <p className="rx-lede" id="lede">{t('home.loading')}</p>
        {enlaceAjustes ? <p><Link className="rx-link" href={enlaceAjustes.href}>{enlaceAjustes.texto} →</Link></p> : null}
      </header>

      <section className="rx-section" id="evolucion" hidden>
        <h2 className="rx-h2">{t('home.evolution')}</h2>
        <article className="rx-card">
          <h3>{t('home.evolution.card')}</h3>
          <p className="rx-note">{t('home.evolution.note')}</p>
          <div className="rx-chart" id="ch-evolucion"></div>
        </article>
      </section>

      <section className="rx-section" id="jugadores" hidden>
        <h2 className="rx-h2">{t('home.players')}</h2>
        <p className="rx-note">{t('home.players.note')}</p>
        <input className="hm-search" type="search" id="buscar-jugador" autoComplete="off" spellCheck={false}
          placeholder={t('home.players.search')} aria-label={t('home.players.search')} />
        <p className="rx-note" id="buscar-estado" aria-live="polite" hidden></p>
        <ul className="hm-players" id="lista-jugadores"></ul>
      </section>

      <section className="rx-section">
        <h2 className="rx-h2">{t('home.all')}</h2>
        <ul className="hm-list" id="lista"></ul>
      </section>

      <p className="rx-foot">{t('home.foot')}</p>
    </main>
  );
}
