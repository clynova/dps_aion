// Ficha de un jefe del módulo «Raids»: nombre, retrato, su ficha (contenido/raids/<raid>/<npc>.<idioma>.json: fases,
// mecánicas, consejos, notas y fuentes) si la tiene, y las cifras de las raids públicas (sumando sus npc de todos los modos).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import PiePagina from '@/components/PiePagina';
import FichaJefe from '@/components/guia/FichaJefe';
import { fechaLarga, Fuentes } from '@/components/guia/Piezas';
import { cifrasPublicas } from '@/lib/guia/cifras';
import { fuentesDe, jefeJuego, nombreJefe, npcsDelJefe, raidGuia, urlRetrato, type RaidGuia } from '@/lib/guia/contenido';
import { localeDe, rutaEn, type Idioma, type Traductor } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';

type Props = PageProps<'/[lang]/guias/[raid]/[npc]'>;

/** La raid y el npc, si el npc es uno de los jefes de la ficha. */
function buscar(raid: string, npc: string) {
  const r = raidGuia(raid);
  if (!r || !/^\d{1,9}$/.test(npc) || !r.es.jefes.includes(Number(npc))) return null;
  return { raid: r, npc: Number(npc) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ raid, npc }, { t, idioma }] = await Promise.all([params, textos()]);
  const x = buscar(raid, npc);
  return x ? { title: `${nombreJefe(x.npc, idioma)} · ${x.raid[idioma].nombre}` } : { title: t('guias.titulo') };
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
  const [{ raid: id, npc: n }, { t, idioma }] = await Promise.all([params, textos()]);
  const x = buscar(id, n);
  if (!x) notFound();
  const { raid, npc } = x;
  const retrato = urlRetrato(jefeJuego(npc)?.retrato);
  const ficha = raid.jefes[npc]?.[idioma] ?? null;
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior>
          <Link className="rx-back" href={rutaEn(idioma, `/guias/${raid.es.id}`)}>{t('guias.volverRaid', { raid: raid[idioma].nombre })}</Link>
        </BarraSuperior>
        <div className="gx-cabecera">
          {/* eslint-disable-next-line @next/next/no-img-element -- retrato del CDN de questlog.gg, sin optimizar */}
          {retrato ? <img className="gx-retrato gx-retrato-grande" src={retrato} alt="" width={96} height={96} /> : null}
          <div>
            <p className="rx-eyebrow">{t('guias.jefe.de', { raid: raid[idioma].nombre })}</p>
            <h1 className="rx-title">{nombreJefe(npc, idioma)}</h1>
          </div>
        </div>
      </header>
      {ficha ? (
        <>
          <p className="rx-lede">{ficha.resumen}</p>
          <p className="rx-note">{t('guias.revisado', { f: fechaLarga(ficha.revisado, idioma), p: fechaLarga(ficha.parche, idioma) })}</p>
          <FichaJefe t={t} idioma={idioma} ficha={ficha} />
        </>
      ) : <p className="rx-pending">{t('guias.preparacion')}</p>}
      <section className="rx-section">
        <h2 className="rx-h2">{t('guias.cifras')}</h2>
        <Suspense fallback={<p className="rx-note">{t('guias.cargando')}</p>}>
          <Cifras t={t} idioma={idioma} raid={raid} npc={npc} />
        </Suspense>
        <p className="rx-note">{t('guias.cifras.nota')}</p>
      </section>
      {ficha ? <><p className="rx-note">{t('guias.origen.leyenda')}</p><Fuentes t={t} idioma={idioma} ids={fuentesDe(ficha)} /></> : null}
      <PiePagina t={t} idioma={idioma} />
    </main>
  );
}

async function Cifras({ t, idioma, raid, npc }: { t: Traductor; idioma: Idioma; raid: RaidGuia; npc: number }) {
  const todas = await cifrasPublicas({ jefe: npcsDelJefe(raid, npc) });
  if (!todas) return <p className="rx-pending">{t('guias.cifras.error')}</p>;
  const c = todas.get('jefe');
  if (!c) return <p className="rx-pending">{t('guias.cifras.vacio')}</p>;
  const n0 = new Intl.NumberFormat(localeDe(idioma));
  const tile = (etiqueta: string, valor: number, ok = false) => (
    <div className="rx-tile"><span className="rx-tile-label">{etiqueta}</span><span className={`rx-tile-value${ok ? ' is-ok' : ''}`}>{n0.format(valor)}</span></div>
  );
  return (
    <>
      <div className="rx-tiles">
        {tile(t('guias.tile.noches'), c.noches)}
        {tile(t('guias.tile.intentos'), c.intentos)}
        {tile(t('guias.tile.kills'), c.kills, c.kills > 0)}
        {tile(t('guias.tile.grupos'), c.grupos)}
      </div>
      {c.ultima ? <p className="rx-note">{t('guias.ultima', { f: fechaLarga(c.ultima, idioma) })}</p> : null}
    </>
  );
}
