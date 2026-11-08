// Perfil de un jugador (lo que era jugadores/<slug>/): reúne las raids que quien mira puede ver en listados
// (públicas de grupos visibles y todas las de sus grupos). Si no le queda ninguna, 404.
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import PlantillaPerfil from '@/components/jugador/PlantillaPerfil';
import { MontarPerfil } from '@/components/legado/Montar';
import { usuarioActual } from '@/lib/auth/sesion';
import { gruposDeUsuario } from '@/lib/db/grupos';
import { rutaEn } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';
import type { Rol } from '@/lib/permisos';
import { perfilParaVer } from '@/lib/raids/vista';

type Props = PageProps<'/[lang]/jugadores/[slug]'>;

export default async function PaginaJugador({ params }: Props) {
  const { t } = await textos();
  return (
    <Suspense fallback={<main className="rx"><header className="rx-head"><BarraSuperior /><p className="rx-eyebrow">{t('raid.loading')}</p></header></main>}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Props['params'] }) {
  const [{ slug }, { t, idioma }, u] = await Promise.all([params, textos(), usuarioActual()]);
  const mios = new Map<string, Rol>(u ? (await gruposDeUsuario(u.id)).map((g) => [g.id, g.rol]) : []);
  const p = await perfilParaVer(slug, mios, idioma);
  if (!p) notFound();
  // «Volver»: al grupo si todas sus raids son de uno; si no, a la portada
  const grupos = [...new Set(Object.values(p.grupoDeRaid))];
  const volver = rutaEn(idioma, grupos.length === 1 ? `/g/${grupos[0]}` : '/');
  return (
    <>
      <PlantillaPerfil key={`p-${slug}`} t={t} volver={volver} />
      <MontarPerfil key={`m-${slug}`} idioma={idioma} datos={p.datos} perfilClaude={p.perfilClaude} nombres={p.nombres} indice={p.indice} grupoDeRaid={p.grupoDeRaid} />
    </>
  );
}
