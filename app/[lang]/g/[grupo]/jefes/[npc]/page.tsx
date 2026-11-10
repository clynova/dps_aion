// Página de un jefe: todas las raids del grupo contra él, juntas (lib/raids/jefe.ts). Mismos permisos que la página
// del grupo: los miembros ven todas sus raids; el resto, solo las públicas. Sin ninguna visible, 404.
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import PaginaJefe from '@/components/jefe/PaginaJefe';
import { usuarioActual } from '@/lib/auth/sesion';
import { grupoParaVer } from '@/lib/db/grupos';
import { textos } from '@/lib/i18n/servidor';
import { analizarJefe } from '@/lib/raids/jefe';
import { jefeParaVer } from '@/lib/raids/vista';

type Props = PageProps<'/[lang]/g/[grupo]/jefes/[npc]'>;

export default async function Pagina({ params }: Props) {
  const { t } = await textos();
  return (
    <Suspense fallback={<main className="rx"><header className="rx-head"><BarraSuperior /><p className="rx-eyebrow">{t('raid.loading')}</p></header></main>}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Props['params'] }) {
  const [{ grupo: slug, npc }, { t, idioma }, u] = await Promise.all([params, textos(), usuarioActual()]);
  if (!/^\d{1,9}$/.test(npc)) notFound();
  const g = await grupoParaVer(slug, u?.id ?? null);
  if (!g) notFound();
  const j = await jefeParaVer(g.grupo, g.rol, Number(npc), idioma);
  if (!j) notFound();
  return <PaginaJefe t={t} idioma={idioma} grupo={{ slug, nombre: g.grupo.nombre }} jefe={j.jefe} a={analizarJefe(j.raids)} nombres={j.nombres} />;
}
