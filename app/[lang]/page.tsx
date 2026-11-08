// Portada (fase 2: solo el esqueleto, todavía sin datos). En la fase 5 leerá raids y jugadores de la base.
import type { Metadata } from 'next';
import BarraSuperior from '@/components/BarraSuperior';
import { textos } from '@/lib/i18n/servidor';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  // Igual que la web actual: «DPS Aion · Raids del grupo» (la plantilla del layout no se aplica a su propia página)
  return { title: { absolute: `${t('site.name')} · ${t('home.title')}` }, description: t('home.foot') };
}

export default async function Portada() {
  const { t } = await textos();
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><p className="rx-eyebrow">{t('home.eyebrow')}</p></BarraSuperior>
        <h1 className="rx-title">{t('home.title')}</h1>
        <p className="rx-lede">{t('home.empty')}</p>
      </header>
      <section className="rx-section">
        <h2 className="rx-h2">{t('home.all')}</h2>
        <p className="rx-pending">{t('home.empty')}</p>
      </section>
      <p className="rx-foot">{t('home.foot')}</p>
    </main>
  );
}
