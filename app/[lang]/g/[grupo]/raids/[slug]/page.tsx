// Página de una raid (lo que era raids/<slug>/ en la web estática). Privada: solo miembros; con enlace o pública:
// cualquiera que llegue. La plantilla sale del servidor ya traducida y el módulo de lib/legado pinta los datos.
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import { MontarRaid } from '@/components/legado/Montar';
import PlantillaRaid from '@/components/raid/PlantillaRaid';
import { usuarioActual } from '@/lib/auth/sesion';
import { rolEn } from '@/lib/db/grupos';
import { rutaEn } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';
import { raidParaVer } from '@/lib/raids/vista';

type Props = PageProps<'/[lang]/g/[grupo]/raids/[slug]'>;

export default async function PaginaRaid({ params }: Props) {
  const { t } = await textos();
  return (
    <Suspense fallback={<main className="rx"><header className="rx-head"><BarraSuperior /><p className="rx-eyebrow">{t('raid.loading')}</p></header></main>}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Props['params'] }) {
  const [{ grupo, slug }, { t, idioma }, u] = await Promise.all([params, textos(), usuarioActual()]);
  const r = await raidParaVer(grupo, slug, (grupoId) => rolEn(grupoId, u?.id), idioma);
  if (!r) notFound();
  return (
    <>
      <PlantillaRaid key={`p-${grupo}-${slug}`} t={t} volver={rutaEn(idioma, `/g/${grupo}`)} />
      <MontarRaid key={`m-${grupo}-${slug}`} idioma={idioma} datos={r.datos} analisis={r.analisis} soloEs={r.soloEs} nombres={r.nombres} />
    </>
  );
}
