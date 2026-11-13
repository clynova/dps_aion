// Ficha de un jefe del módulo «Raids»: nombre, retrato y su ficha en pestañas (components/guia/FichaJefe.tsx), con el
// texto de contenido/raids/<raid>/<npc>.<idioma>.json y los datos en vivo de las raids públicas (lib/guia/datos.ts,
// lib/guia/datos-jefe.ts) sumando sus npc de todos los modos. Sin ficha, «en preparación» y las cifras.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import BarraSuperior from '@/components/BarraSuperior';
import PiePagina from '@/components/PiePagina';
import FichaJefe from '@/components/guia/FichaJefe';
import { AvisoParche, fechaLarga } from '@/components/guia/Piezas';
import { usuarioActual } from '@/lib/auth/sesion';
import { cifrasPublicas } from '@/lib/guia/cifras';
import { jefeJuego, nombreJefe, npcsDelJefe, raidGuia, urlRetrato, type RaidGuia } from '@/lib/guia/contenido';
import { gruposConJefe, raidsPublicasDelJefe } from '@/lib/guia/datos';
import { datosJefeGuia } from '@/lib/guia/datos-jefe';
import type { FichaJefe as Ficha } from '@/lib/guia/esquema';
import { localeDe, rutaEn, type Idioma, type Traductor } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';

type Props = PageProps<'/[lang]/guias/[raid]/[npc]'>;

/** La raid y el npc, si el npc es uno de los jefes de la ficha. */
function buscar(raid: string, npc: string) {
  const r = raidGuia(raid);
  if (!r || !/^\d{1,9}$/.test(npc) || !r.es.jefes.includes(Number(npc))) return null;
  return { raid: r, npc: Number(npc) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ raid, npc }, { t, idioma }] = await Promise.all([params, textos()]);
  const x = buscar(raid, npc);
  if (!x) return { title: t('guias.titulo') };
  return { title: `${nombreJefe(x.npc, idioma)} · ${x.raid[idioma].nombre}`, description: x.raid.jefes[x.npc]?.[idioma].resumen };
}

export default async function Pagina({ params }: Props) {
  const { t } = await textos();
  return (
    <Suspense fallback={<main className="rx"><header className="rx-head"><BarraSuperior /><p className="rx-eyebrow">{t('raid.loading')}</p></header></main>}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Props['params'] }) {
  const [{ raid: id, npc: n }, { t, idioma }] = await Promise.all([params, textos()]);
  const x = buscar(id, n);
  if (!x) notFound();
  const { raid, npc } = x;
  const retrato = urlRetrato(jefeJuego(npc)?.retrato);
  const ficha = raid.jefes[npc]?.[idioma] ?? null;
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior>
          <Link className="rx-back" href={rutaEn(idioma, `/guias/${raid.es.id}`)}>{t('guias.volverRaid', { raid: raid[idioma].nombre })}</Link>
        </BarraSuperior>
        <div className="gx-cabecera">
          {/* eslint-disable-next-line @next/next/no-img-element -- retrato del CDN de questlog.gg, sin optimizar */}
          {retrato ? <img className="gx-retrato gx-retrato-grande" src={retrato} alt="" width={96} height={96} /> : null}
          <div>
            <p className="rx-eyebrow">{t('guias.jefe.de', { raid: raid[idioma].nombre })}</p>
            <h1 className="rx-title">{nombreJefe(npc, idioma)}</h1>
          </div>
        </div>
        {ficha ? <p className="rx-lede">{ficha.resumen}</p> : null}
        {ficha ? <p className="rx-note">{t('guias.revisado', { f: fechaLarga(ficha.revisado, idioma), p: fechaLarga(ficha.parche, idioma) })}</p> : null}
        {ficha ? <AvisoParche t={t} idioma={idioma} raid={raid.es.id} desde={ficha.parche} /> : null}
      </header>
      {ficha ? (
        <Suspense fallback={<FichaJefe t={t} idioma={idioma} ficha={ficha} gsEntrada={gsEntrada(raid)} datos={undefined} nombres={null} cifras={undefined} tuGrupo={[]} />}>
          <ConDatos t={t} idioma={idioma} raid={raid} npc={npc} ficha={ficha} />
        </Suspense>
      ) : (
        <>
          <p className="rx-pending">{t('guias.preparacion')}</p>
          <Suspense fallback={<p className="rx-note">{t('guias.cargando')}</p>}>
            <SoloCifras t={t} idioma={idioma} raid={raid} npc={npc} />
          </Suspense>
        </>
      )}
      <PiePagina t={t} idioma={idioma} />
    </main>
  );
}

type Base = { t: Traductor; idioma: Idioma; raid: RaidGuia; npc: number };

/** GS de entrada de cada modo de la raid (de su ficha). */
const gsEntrada = (raid: RaidGuia) => raid.es.mazmorras.flatMap((m) => (raid.es.gs[m.modo] ? [{ modo: m.modo, valor: raid.es.gs[m.modo]!.valor }] : []));

async function ConDatos({ t, idioma, raid, npc, ficha }: Base & { ficha: Ficha }) {
  const npcs = npcsDelJefe(raid, npc);
  const [cifras, publicas, u] = await Promise.all([cifrasPublicas({ jefe: npcs }), raidsPublicasDelJefe(npcs, idioma), usuarioActual()]);
  const tuGrupo = u ? await gruposConJefe(u.id, npcs) : [];
  const datos = publicas ? datosJefeGuia(publicas.raids, ficha.mecanicas, ficha.revisado) : null;
  return (
    <FichaJefe t={t} idioma={idioma} ficha={ficha} gsEntrada={gsEntrada(raid)} datos={datos} nombres={publicas?.nombres ?? null}
      cifras={cifras === null ? 'error' : (cifras.get('jefe') ?? null)} tuGrupo={tuGrupo} />
  );
}

async function SoloCifras({ t, idioma, raid, npc }: Base) {
  const todas = await cifrasPublicas({ jefe: npcsDelJefe(raid, npc) });
  if (!todas) return <p className="rx-pending">{t('guias.cifras.error')}</p>;
  const c = todas.get('jefe');
  if (!c) return <p className="rx-pending">{t('guias.cifras.vacio')}</p>;
  const n0 = new Intl.NumberFormat(localeDe(idioma));
  const tiles: [string, number][] = [[t('guias.tile.noches'), c.noches], [t('guias.tile.intentos'), c.intentos], [t('guias.tile.kills'), c.kills], [t('guias.tile.grupos'), c.grupos]];
  return (
    <section className="rx-section">
      <h2 className="rx-h2">{t('guias.cifras')}</h2>
      <div className="rx-tiles">
        {tiles.map(([e, v]) => <div key={e} className="rx-tile"><span className="rx-tile-label">{e}</span><span className="rx-tile-value">{n0.format(v)}</span></div>)}
      </div>
      <p className="rx-note">{t('guias.cifras.nota')}</p>
    </section>
  );
}
