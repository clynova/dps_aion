// Página de un grupo (fase 3: cabecera y rol; las raids llegan en la fase 5). Un grupo oculto da 404 a quien no
// es miembro. Lee la sesión y la base → todo el contenido va en <Suspense>.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import { usuarioActual } from '@/lib/auth/sesion';
import { contarMiembros, grupoParaVer } from '@/lib/db/grupos';
import { rutaEn } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';
import { puede } from '@/lib/permisos';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  return { title: t('grupo.raids'), robots: { index: false } };
}

export default async function PaginaGrupo({ params }: PageProps<'/[lang]/g/[grupo]'>) {
  const { t, idioma } = await textos();
  return (
    <main className="rx">
      <Suspense fallback={<header className="rx-head"><BarraSuperior /><p className="rx-note">{t('raid.loading')}</p></header>}>
        <Contenido params={params} />
      </Suspense>
      <p className="rx-foot"><Link className="rx-link" href={rutaEn(idioma, '/mis-grupos')}>{t('cuenta.misGrupos')}</Link></p>
    </main>
  );
}

async function Contenido({ params }: { params: PageProps<'/[lang]/g/[grupo]'>['params'] }) {
  const [{ grupo: slug }, { t, idioma }, u] = await Promise.all([params, textos(), usuarioActual()]);
  const r = await grupoParaVer(slug, u?.id ?? null);
  if (!r) notFound();
  const { grupo, rol } = r;
  const n = await contarMiembros(grupo.id);
  return (
    <>
      <header className="rx-head">
        <BarraSuperior><p className="rx-eyebrow">{n === 1 ? t('grupo.miembros1') : t('grupo.miembrosN', { n })}</p></BarraSuperior>
        <h1 className="rx-title">{grupo.nombre}</h1>
        <p className="rx-lede">
          {grupo.visible ? t('grupo.publico') : t('grupo.oculto')}
          {rol ? <> · {t('grupo.tuRol', { rol: t(`rol.${rol}`) })}</> : null}
        </p>
        {rol ? <p><Link className="rx-link" href={rutaEn(idioma, `/g/${grupo.slug}/ajustes`)}>{puede(rol, 'ajustes') ? t('grupo.ajustes') : t('ajustes.miembros')} →</Link></p> : null}
      </header>
      <section className="rx-section">
        <h2 className="rx-h2">{t('grupo.raids')}</h2>
        <p className="rx-pending">{t('grupo.raids.vacio')}</p>
      </section>
    </>
  );
}
