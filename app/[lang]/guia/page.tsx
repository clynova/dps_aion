// Guía «Cómo subir tu primera raid» (fase 10): de Questlog a la página del grupo, para grupos nuevos. Sin datos de la
// base: página estática por idioma.
import type { Metadata } from 'next';
import Link from 'next/link';
import BarraSuperior from '@/components/BarraSuperior';
import PiePagina from '@/components/PiePagina';
import { rutaEn, type Clave } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';
import { LIMITE_RAIDS } from '@/lib/limites';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  return { title: t('guia.titulo'), description: t('guia.lede') };
}

const PASOS = [1, 2, 3, 4, 5, 6] as const;

export default async function Guia() {
  const { t, idioma } = await textos();
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><Link className="rx-back" href={rutaEn(idioma, '/')}>{t('raid.back')}</Link></BarraSuperior>
        <h1 className="rx-title">{t('guia.titulo')}</h1>
        <p className="rx-lede">{t('guia.lede')}</p>
      </header>
      <section className="rx-section cx-pila">
        {PASOS.map((n) => (
          <article key={n} className="rx-card">
            <h3>{t(`guia.${n}.t` as Clave)}</h3>
            <p className="cx-texto">{t(`guia.${n}` as Clave)}</p>
          </article>
        ))}
        <p className="cx-fila">
          <Link className="cx-boton" href={rutaEn(idioma, '/mis-grupos')}>{t('portada.empezar.grupos')}</Link>
        </p>
      </section>
      <section className="rx-section">
        <h2 className="rx-h2">{t('guia.extra')}</h2>
        <ul className="rx-card cx-texto">
          <li>{t('guia.extra.ia')}</li>
          <li>{t('guia.extra.discord')}</li>
          <li>{t('guia.extra.pc')}</li>
          <li>{t('guia.extra.limite', { n: LIMITE_RAIDS })}</li>
        </ul>
      </section>
      <section className="rx-section">
        <h2 className="rx-h2">{t('guia.problemas')}</h2>
        <ul className="rx-card cx-texto">
          <li>{t('guia.problemas.1')}</li>
          <li>{t('guia.problemas.2')}</li>
          <li>{t('guia.problemas.3')}</li>
        </ul>
      </section>
      <PiePagina t={t} idioma={idioma} />
    </main>
  );
}
