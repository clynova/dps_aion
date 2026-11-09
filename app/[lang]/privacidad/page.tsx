// Privacidad y condiciones (fase 10): qué se guarda, quién lo ve, servicios externos, cookies y cómo borrar datos u
// ocultar un personaje. Si cambia lo que se guarda o con quién se comparte, actualizar el texto y PRIVACIDAD_ACTUALIZADA.
import type { Metadata } from 'next';
import Link from 'next/link';
import BarraSuperior from '@/components/BarraSuperior';
import PiePagina from '@/components/PiePagina';
import { localeDe, rutaEn, type Clave } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';
import { LIMITE_RAIDS } from '@/lib/limites';
import { CONTACTO, PRIVACIDAD_ACTUALIZADA } from '@/lib/sitio';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  return { title: t('privacidad.titulo'), description: t('privacidad.lede') };
}

const APARTADOS = ['raids', 'cuenta', 'quien', 'terceros', 'cookies', 'borrar', 'condiciones'] as const;

export default async function Privacidad() {
  const { t, idioma } = await textos();
  const correo = <a className="rx-link" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>;
  // {c} es el correo (enlace) y {n} el límite de raids
  const parrafo = (clave: Clave) => {
    const [antes, despues] = t(clave, { n: LIMITE_RAIDS }).split('{c}');
    return despues === undefined ? antes : <>{antes}{correo}{despues}</>;
  };
  const fecha = new Date(`${PRIVACIDAD_ACTUALIZADA}T12:00:00Z`).toLocaleDateString(localeDe(idioma), { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><Link className="rx-back" href={rutaEn(idioma, '/')}>{t('raid.back')}</Link></BarraSuperior>
        <h1 className="rx-title">{t('privacidad.titulo')}</h1>
        <p className="rx-lede">{t('privacidad.lede')}</p>
      </header>
      {APARTADOS.map((a) => (
        <section key={a} className="rx-section" id={a}>
          <h2 className="rx-h2">{t(`privacidad.${a}.t` as Clave)}</h2>
          <p className="cx-texto">{parrafo(`privacidad.${a}` as Clave)}</p>
        </section>
      ))}
      <section className="rx-section">
        <p className="rx-note">{t('privacidad.contacto', { c: '' })}{correo} · {t('privacidad.actualizado', { d: fecha })}</p>
      </section>
      <PiePagina t={t} idioma={idioma} />
    </main>
  );
}
