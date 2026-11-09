// Subir una raid desde el navegador (fase 6). Publicador o más; el cálculo ocurre en el navegador de quien sube.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { eq } from 'drizzle-orm';
import BarraSuperior from '@/components/BarraSuperior';
import { BotonEntrar } from '@/components/cuenta/BotonesCuenta';
import Asistente from '@/components/subida/Asistente';
import { usuarioActual } from '@/lib/auth/sesion';
import { db } from '@/lib/db/client';
import { grupoParaVer } from '@/lib/db/grupos';
import { raids } from '@/lib/db/schema';
import { rutaEn } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';
import { puede } from '@/lib/permisos';
import { nombresPara } from '@/lib/raids/vista';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  return { title: t('subir.enlace'), robots: { index: false } };
}

type Props = PageProps<'/[lang]/g/[grupo]/subir'>;

export default async function Subir({ params }: Props) {
  const { t } = await textos();
  return (
    <main className="rx">
      <Suspense fallback={<header className="rx-head"><BarraSuperior /><p className="rx-note">{t('raid.loading')}</p></header>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: Props['params'] }) {
  const [{ grupo: slug }, { t, idioma }, u] = await Promise.all([params, textos(), usuarioActual()]);
  const r = await grupoParaVer(slug, u?.id ?? null);
  if (!r) notFound();
  const cabecera = (
    <header className="rx-head">
      <BarraSuperior><Link className="rx-back" href={rutaEn(idioma, `/g/${slug}`)}>{t('comun.volver')}</Link></BarraSuperior>
      <h1 className="rx-title">{t('subir.titulo', { grupo: r.grupo.nombre })}</h1>
      <p className="rx-lede">{t('subir.lede')}</p>
    </header>
  );
  if (!u) return <>{cabecera}<p className="rx-pending">{t('comun.entrarPrimero')}</p><div><BotonEntrar texto={t('cuenta.entrar')} /></div></>;
  if (!puede(r.rol, 'subir_raid')) return <>{cabecera}<p className="rx-pending">{t('subir.sinPermiso')}</p></>;
  const [npcsEs, n, subidas] = await Promise.all([
    nombresPara('es', r.grupo.id).then((x) => x.npcs),
    nombresPara(idioma, r.grupo.id),
    db.select({ run: raids.runId }).from(raids).where(eq(raids.grupoId, r.grupo.id)),
  ]);
  return (
    <>
      {cabecera}
      <Asistente idioma={idioma} grupo={slug} visibilidadDefecto={r.grupo.visibilidadDefecto} npcsEs={npcsEs} npcs={n.npcs}
        yaSubidas={subidas.map((s) => s.run).filter((x): x is string => !!x)} />
    </>
  );
}
