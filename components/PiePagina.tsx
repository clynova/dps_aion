// Pie de las páginas de información: guía y privacidad (y el texto de pie que se le pase).
import Link from 'next/link';
import { rutaEn, type Idioma, type Traductor } from '@/lib/i18n';

export default function PiePagina({ t, idioma, texto }: { t: Traductor; idioma: Idioma; texto?: string }) {
  return (
    <footer className="rx-foot cx-pie">
      {texto ? <p>{texto}</p> : null}
      <p className="cx-fila">
        <Link className="rx-link" href={rutaEn(idioma, '/guia')}>{t('pie.guia')}</Link>
        <span aria-hidden="true">·</span>
        <Link className="rx-link" href={rutaEn(idioma, '/privacidad')}>{t('pie.privacidad')}</Link>
      </p>
    </footer>
  );
}
