// Mis grupos: los grupos del usuario y el formulario para crear uno. Lee la sesión → contenido en <Suspense>.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import { BotonEntrar } from '@/components/cuenta/BotonesCuenta';
import FormCrearGrupo from '@/components/grupos/FormCrearGrupo';
import { usuarioActual } from '@/lib/auth/sesion';
import { gruposDeUsuario } from '@/lib/db/grupos';
import { rutaEn } from '@/lib/i18n';
import { textosError } from '@/lib/i18n/errores';
import { textos } from '@/lib/i18n/servidor';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  return { title: t('grupos.titulo'), robots: { index: false } };
}

export default async function MisGrupos() {
  const { t, idioma } = await textos();
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><Link className="rx-back" href={rutaEn(idioma, '/')}>{t('raid.back')}</Link></BarraSuperior>
        <h1 className="rx-title">{t('grupos.titulo')}</h1>
        <p className="rx-lede">{t('grupos.nota')}</p>
      </header>
      <Suspense fallback={<p className="rx-note">{t('raid.loading')}</p>}>
        <Contenido />
      </Suspense>
    </main>
  );
}

async function Contenido() {
  const [{ t, idioma }, u] = await Promise.all([textos(), usuarioActual()]);
  if (!u) {
    return (
      <section className="rx-section">
        <p className="rx-pending">{t('comun.entrarPrimero')}</p>
        <div><BotonEntrar texto={t('cuenta.entrar')} /></div>
      </section>
    );
  }
  const lista = await gruposDeUsuario(u.id);
  return (
    <>
      <section className="rx-section">
        {lista.length ? (
          <ul className="cx-lista rx-card">
            {lista.map((g) => (
              <li key={g.id}>
                <span className="cx-crece">
                  <Link href={rutaEn(idioma, `/g/${g.slug}`)}>{g.nombre}</Link>
                  <span className="cx-codigo">/g/{g.slug}</span>
                </span>
                <span className="rx-pill">{t(`rol.${g.rol}`)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="rx-pending">{t('grupos.vacio')}</p>}
      </section>
      <section className="rx-section">
        <h2 className="rx-h2">{t('grupos.crear')}</h2>
        <FormCrearGrupo lang={idioma} errores={textosError(t)}
          t={{ nombre: t('grupos.nombre'), slug: t('grupos.slug'), ayuda: t('grupos.slug.ayuda'), boton: t('grupos.crear.boton') }} />
      </section>
    </>
  );
}
