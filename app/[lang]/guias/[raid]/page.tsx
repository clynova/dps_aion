// Ficha de una raid del módulo «Raids»: resumen, modos y GS de entrada, jefes (con las cifras de las raids públicas),
// reglas, composición, notas y fuentes. El contenido sale de contenido/raids/<raid>/raid.<idioma>.json.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import PiePagina from '@/components/PiePagina';
import JefesConCifras from '@/components/guia/JefesConCifras';
import { Afirmaciones, fechaLarga, Fuentes, ListaJefes, Modos, Origen } from '@/components/guia/Piezas';
import { fuentesDe, raidGuia } from '@/lib/guia/contenido';
import { localeDe, rutaEn } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';

type Props = PageProps<'/[lang]/guias/[raid]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ raid }, { t, idioma }] = await Promise.all([params, textos()]);
  const r = raidGuia(raid);
  return r ? { title: r[idioma].nombre, description: r[idioma].resumen } : { title: t('guias.titulo') };
}

export default async function Pagina({ params }: Props) {
  const { t } = await textos();
  return (
    <Suspense fallback={<main className="rx"><header className="rx-head"><BarraSuperior /><p className="rx-eyebrow">{t('raid.loading')}</p></header></main>}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Props['params'] }) {
  const [{ raid: id }, { t, idioma }] = await Promise.all([params, textos()]);
  const raid = raidGuia(id);
  if (!raid) notFound();
  const r = raid[idioma];
  const n0 = new Intl.NumberFormat(localeDe(idioma));
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><Link className="rx-back" href={rutaEn(idioma, '/guias')}>{t('guias.volver')}</Link></BarraSuperior>
        <p className="rx-eyebrow">{t('guias.eyebrow')}</p>
        <h1 className="rx-title">{r.nombre}</h1>
        <p className="rx-lede">{r.resumen}</p>
        <Modos t={t} idioma={idioma} raid={raid} />
        <p className="rx-note">{t('guias.revisado', { f: fechaLarga(r.revisado, idioma), p: fechaLarga(r.parche, idioma) })}</p>
      </header>

      <section className="rx-tiles rx-tiles-cab">
        <div className="rx-tile"><span className="rx-tile-label">{t('guias.tile.jugadores')}</span><span className="rx-tile-value">{n0.format(r.jugadores)}</span></div>
        <div className="rx-tile"><span className="rx-tile-label">{t('guias.tile.jefes')}</span><span className="rx-tile-value">{n0.format(r.jefes.length)}</span></div>
        {r.mazmorras.map((m) => {
          const gs = r.gs[m.modo];
          return gs ? (
            <div key={m.id} className="rx-tile">
              <span className="rx-tile-label">{t('guias.tile.gs', { modo: t(`guias.modo.${m.modo}`) })}</span>
              <span className="rx-tile-value">{n0.format(gs.valor)}</span>
              <span className="rx-tile-note"><Origen t={t} origen={gs.origen} fuentes={gs.fuentes} /></span>
            </div>
          ) : null;
        })}
      </section>

      <section className="rx-section">
        <h2 className="rx-h2">{t('guias.jefes')}</h2>
        <p className="rx-note">{t('guias.jefes.nota')}</p>
        <Suspense fallback={<ListaJefes t={t} idioma={idioma} raid={r.id} jefes={r.jefes} cifras={undefined} />}>
          <JefesConCifras t={t} idioma={idioma} raid={raid} />
        </Suspense>
        <p className="rx-note">{t('guias.cifras.nota')}</p>
      </section>

      {r.reglas.length ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('guias.reglas')}</h2>
          <div className="rx-card"><Afirmaciones t={t} items={r.reglas} /></div>
        </section>
      ) : null}
      {r.composicion.length ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('guias.composicion')}</h2>
          <div className="rx-card"><Afirmaciones t={t} items={r.composicion} /></div>
        </section>
      ) : null}
      {r.notas.length ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('guias.notas')}</h2>
          <dl className="rx-card gx-notas">
            {r.notas.map((n) => <div key={n.termino}><dt>{n.termino}</dt><dd>{n.texto}</dd></div>)}
          </dl>
        </section>
      ) : null}
      <p className="rx-note">{t('guias.origen.leyenda')}</p>
      <Fuentes t={t} idioma={idioma} ids={fuentesDe(r)} />
      <PiePagina t={t} idioma={idioma} />
    </main>
  );
}
