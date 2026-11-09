// Página de una raid (lo que era raids/<slug>/ en la web estática). Privada: solo miembros; con enlace o pública:
// cualquiera que llegue. La plantilla sale del servidor ya traducida y el módulo de lib/legado pinta los datos.
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import { MontarRaid } from '@/components/legado/Montar';
import BotonAnalizarIA from '@/components/raid/BotonAnalizarIA';
import Mecanicas from '@/components/raid/Mecanicas';
import PlantillaRaid from '@/components/raid/PlantillaRaid';
import Repaso from '@/components/raid/Repaso';
import Seguimiento from '@/components/raid/Seguimiento';
import { iaConfigurada } from '@/lib/analisis/deepseek';
import { estadoAnalisisIA } from '@/lib/analisis/ia';
import { usuarioActual } from '@/lib/auth/sesion';
import { rolEn } from '@/lib/db/grupos';
import { localeDe, rutaEn } from '@/lib/i18n';
import { puede } from '@/lib/permisos';
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
  // Análisis con IA: solo para quien puede subir raids al grupo y si la clave de DeepSeek está configurada
  const ia = puede(r.rol, 'subir_raid') && iaConfigurada() ? await estadoAnalisisIA(r.raid.id) : null;
  const accion = ia ? (
    <BotonAnalizarIA url={`/api/v1/grupos/${grupo}/raids/${slug}/analizar`} inicial={ia} locale={localeDe(idioma)}
      tieneAnalisis={!(r.analisis as { pendiente?: boolean }).pendiente}
      t={{ boton: t('ia.boton'), enCurso: t('ia.enCurso'), espera: t('ia.espera'), listo: t('ia.listo'), error: t('ia.error'), confirmar: t('ia.confirmar') }} />
  ) : null;
  return (
    <>
      <PlantillaRaid key={`p-${grupo}-${slug}`} t={t} volver={rutaEn(idioma, `/g/${grupo}`)} accion={accion}
        repaso={<Repaso t={t} idioma={idioma} datos={r.datos} nombres={r.nombres} />}
        mecanicas={<Mecanicas t={t} idioma={idioma} datos={r.datos} nombres={r.nombres} />}
        seguimiento={r.anterior ? <Seguimiento t={t} idioma={idioma} grupo={grupo} nombres={r.nombres} datos={r.datos} anterior={r.anterior} /> : null} />
      <MontarRaid key={`m-${grupo}-${slug}`} idioma={idioma} datos={r.datos} analisis={r.analisis} soloEs={r.soloEs} nombres={r.nombres} />
    </>
  );
}
