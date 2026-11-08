// 404 en el idioma de la página. También es lo que ve quien entra en un grupo oculto o una raid privada sin permiso
// (no se distingue «no existe» de «no puedes verlo», para no revelar qué grupos existen).
import Link from 'next/link';
import BarraSuperior from '@/components/BarraSuperior';
import { rutaEn } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';

export default async function NoEncontrado() {
  const { t, idioma } = await textos();
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><p className="rx-eyebrow">404</p></BarraSuperior>
        <h1 className="rx-title">{t('noEncontrado.titulo')}</h1>
        <p className="rx-lede">{t('noEncontrado.texto')}</p>
        <p><Link className="rx-link" href={rutaEn(idioma, '/')}>{t('noEncontrado.inicio')} →</Link></p>
      </header>
    </main>
  );
}
