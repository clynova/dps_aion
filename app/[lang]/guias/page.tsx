// Módulo «Raids» (docs/plan-guia-raids.md): índice con cada raid de la guía, sus modos, su GS de entrada y sus jefes
// con las cifras de las raids públicas. El contenido sale de contenido/ (estático); las cifras, de la base, en <Suspense>.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import PiePagina from '@/components/PiePagina';
import JefesConCifras from '@/components/guia/JefesConCifras';
import { ListaJefes, Modos } from '@/components/guia/Piezas';
import { parchesPosteriores, raidsGuia } from '@/lib/guia/contenido';
import { rutaEn } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  return { title: t('guias.titulo'), description: t('guias.lede') };
}

export default async function Guias() {
  const { t, idioma } = await textos();
  const raids = raidsGuia();
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><Link className="rx-back" href={rutaEn(idioma, '/')}>{t('comun.volver')}</Link></BarraSuperior>
        <p className="rx-eyebrow">{t('guias.eyebrow')}</p>
        <h1 className="rx-title">{t('guias.titulo')}</h1>
        <p className="rx-lede">{t('guias.lede')}</p>
      </header>
      {raids.length ? null : <p className="rx-pending">{t('guias.vacio')}</p>}
      {raids.map((r) => (
        <section key={r.es.id} className="rx-section gx-raid">
          <h2 className="rx-h2">
            <Link href={rutaEn(idioma, `/guias/${r.es.id}`)}>{r[idioma].nombre}</Link>
            {parchesPosteriores(r.es.id, r.es.parche).length ? <> <span className="rx-pill is-pending">{t('guias.revisar.chip')}</span></> : null}
          </h2>
          <Modos t={t} idioma={idioma} raid={r} />
          <p className="cx-texto">{r[idioma].resumen}</p>
          <Suspense fallback={<ListaJefes t={t} idioma={idioma} raid={r.es.id} jefes={r.es.jefes} cifras={undefined} />}>
            <JefesConCifras t={t} idioma={idioma} raid={r} />
          </Suspense>
        </section>
      ))}
      <p className="rx-note">{t('guias.cifras.nota')}</p>
      <PiePagina t={t} idioma={idioma} />
    </main>
  );
}
