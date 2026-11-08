// Aceptar una invitación (/unirse/<codigo>). Sin sesión: botón de Discord, que vuelve aquí tras entrar.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import Formulario from '@/components/Formulario';
import { BotonEntrar } from '@/components/cuenta/BotonesCuenta';
import { accionAceptarInvitacion } from '@/lib/acciones/grupos';
import { usuarioActual } from '@/lib/auth/sesion';
import { invitacionValida, rolEn } from '@/lib/db/grupos';
import { rutaEn } from '@/lib/i18n';
import { textosError } from '@/lib/i18n/errores';
import { textos } from '@/lib/i18n/servidor';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  return { title: t('unirse.boton'), robots: { index: false } };
}

export default async function Unirse({ params }: PageProps<'/[lang]/unirse/[codigo]'>) {
  const { t } = await textos();
  return (
    <main className="rx">
      <Suspense fallback={<header className="rx-head"><BarraSuperior /><p className="rx-note">{t('raid.loading')}</p></header>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: PageProps<'/[lang]/unirse/[codigo]'>['params'] }) {
  const [{ codigo }, { t, idioma }, u] = await Promise.all([params, textos(), usuarioActual()]);
  const r = await invitacionValida(codigo);
  const cabecera = (titulo: string) => (
    <header className="rx-head">
      <BarraSuperior><Link className="rx-back" href={rutaEn(idioma, '/')}>{t('raid.back')}</Link></BarraSuperior>
      <h1 className="rx-title">{titulo}</h1>
    </header>
  );
  if (!r) return <>{cabecera(t('ajustes.invitaciones'))}<p className="rx-pending">{t('unirse.invalida')}</p></>;
  const ya = u ? await rolEn(r.grupo.id, u.id) : null;
  return (
    <>
      {cabecera(t('unirse.titulo', { grupo: r.grupo.nombre }))}
      <section className="rx-section">
        <p className="rx-lede">{t('unirse.texto', { rol: t(`rol.${r.inv.rol}`) })}</p>
        {!u ? (
          <><p className="rx-note">{t('unirse.entrar')}</p><div><BotonEntrar texto={t('cuenta.entrar')} /></div></>
        ) : ya ? (
          <p><Link className="rx-link" href={rutaEn(idioma, `/g/${r.grupo.slug}`)}>{r.grupo.nombre} →</Link></p>
        ) : (
          <Formulario accion={accionAceptarInvitacion} campos={{ lang: idioma, codigo }} textos={textosError(t)}>
            <div><button type="submit" className="cx-boton">{t('unirse.boton')}</button></div>
          </Formulario>
        )}
      </section>
    </>
  );
}
