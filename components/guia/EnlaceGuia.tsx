// Enlace pequeño de un ataque a su mecánica en la guía de raids (módulo «Raids», fase 7). Va detrás del nombre del ataque
// en las secciones de la raid que salen del servidor (Mecánicas, Repaso). Sin ficha que lo cite, no pinta nada.
import Link from 'next/link';
import { mecanicaDeAtaque } from '@/lib/guia/contenido';
import { rutaEn, type Idioma, type Traductor } from '@/lib/i18n';

export default function EnlaceGuia({ t, idioma, ataque }: { t: Traductor; idioma: Idioma; ataque: string }) {
  const m = ataque ? mecanicaDeAtaque(ataque) : null;
  if (!m) return null;
  return (
    <Link className="gx-enlace-guia" href={rutaEn(idioma, m.ruta)} title={t('guias.enlace.titulo', { m: m.titulo[idioma] })}>
      {t('guias.enlace.corto')}
    </Link>
  );
}
