import type { Metadata } from 'next';
import { Instrument_Sans, Newsreader } from 'next/font/google';
import { IDIOMAS } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';
import '@/styles/site.css';
import '@/styles/base.css';

const sans = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--fuente-sans', display: 'swap' });
const serif = Newsreader({ subsets: ['latin'], axes: ['opsz'], variable: '--fuente-serif', display: 'swap' });

export async function generateStaticParams() {
  return IDIOMAS.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  return { title: { default: t('site.name'), template: `%s · ${t('site.name')}` } };
}

export default async function LayoutRaiz({ children }: LayoutProps<'/[lang]'>) {
  const { idioma } = await textos();
  return (
    <html lang={idioma} className={`${sans.variable} ${serif.variable} fuentes`}>
      <body>{children}</body>
    </html>
  );
}
