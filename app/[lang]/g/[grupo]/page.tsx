// Página de un grupo: lo que era la portada de la web estática (raids, evolución por jefe, jugadores y buscador),
// con las raids que quien mira puede ver. Un grupo oculto da 404 a quien no es miembro.
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import Jefes from '@/components/grupo/Jefes';
import PlantillaGrupo from '@/components/grupo/PlantillaGrupo';
import { MontarGrupo } from '@/components/legado/Montar';
import { usuarioActual } from '@/lib/auth/sesion';
import { contarMiembros, grupoParaVer as grupoConRol } from '@/lib/db/grupos';
import { rutaEn } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';
import { puede } from '@/lib/permisos';
import { grupoParaVer } from '@/lib/raids/vista';

type Props = PageProps<'/[lang]/g/[grupo]'>;

export default async function PaginaGrupo({ params }: Props) {
  const { t } = await textos();
  return (
    <Suspense fallback={<main className="rx"><header className="rx-head"><BarraSuperior /><p className="rx-lede">{t('home.loading')}</p></header></main>}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Props['params'] }) {
  const [{ grupo: slug }, { t, idioma }, u] = await Promise.all([params, textos(), usuarioActual()]);
  const r = await grupoConRol(slug, u?.id ?? null);
  if (!r) notFound();
  const [datos, n] = await Promise.all([grupoParaVer(r.grupo, r.rol, idioma), contarMiembros(r.grupo.id)]);
  const eyebrow = `${t('home.eyebrow')} · ${n === 1 ? t('grupo.miembros1') : t('grupo.miembrosN', { n })}`;
  const enlace = r.rol ? { href: rutaEn(idioma, `/g/${slug}/ajustes`), texto: puede(r.rol, 'ajustes') ? t('grupo.ajustes') : t('ajustes.miembros') } : null;
  return (
    <>
      <PlantillaGrupo key={`p-${slug}`} t={t} nombre={r.grupo.nombre} eyebrow={eyebrow} enlaceAjustes={enlace}
        enlaceSubir={puede(r.rol, 'subir_raid') ? { href: rutaEn(idioma, `/g/${slug}/subir`), texto: t('subir.enlace') } : null}
        jefes={<Jefes t={t} idioma={idioma} grupo={slug} raids={datos.raids} npcs={datos.nombres.npcs} />} />
      <MontarGrupo key={`m-${slug}`} idioma={idioma} grupo={slug} raids={datos.raids} jugadores={datos.jugadores} nombres={datos.nombres}
        conSolicitud={!!r.grupo.discordWebhookCifrado} />
    </>
  );
}
