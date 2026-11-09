// Portada global: qué es la web y los grupos (los visibles y los del usuario). Cada grupo tiene su página con lo que
// antes era la portada (raids, evolución, jugadores). La lista lee la base → en <Suspense>.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { count, desc, eq, inArray, max, or } from 'drizzle-orm';
import BarraSuperior from '@/components/BarraSuperior';
import PiePagina from '@/components/PiePagina';
import { usuarioActual } from '@/lib/auth/sesion';
import { db } from '@/lib/db/client';
import { gruposDeUsuario } from '@/lib/db/grupos';
import { grupos, raids } from '@/lib/db/schema';
import { localeDe, rutaEn, type Clave } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';
import { apareceEnListados } from '@/lib/permisos';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  return { title: { absolute: `${t('site.name')} · ${t('home.title')}` }, description: t('portada.lede') };
}

const QUE = [1, 2, 3, 4] as const;

export default async function Portada() {
  const { t, idioma } = await textos();
  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><p className="rx-eyebrow">{t('home.eyebrow')}</p></BarraSuperior>
        <h1 className="rx-title">{t('site.name')}</h1>
        <p className="rx-lede">{t('portada.lede')}</p>
      </header>
      <section className="rx-section">
        <h2 className="rx-h2">{t('portada.grupos')}</h2>
        <p className="rx-note">{t('portada.grupos.nota')}</p>
        <Suspense fallback={<p className="rx-note">{t('home.loading')}</p>}><Grupos /></Suspense>
      </section>
      <section className="rx-section">
        <h2 className="rx-h2">{t('portada.que')}</h2>
        <div className="rx-grid">
          {QUE.map((n) => (
            <article key={n} className="rx-card">
              <h3>{t(`portada.que.${n}.t` as Clave)}</h3>
              <p className="cx-texto">{t(`portada.que.${n}` as Clave)}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="rx-section">
        <h2 className="rx-h2">{t('portada.empezar')}</h2>
        <p className="cx-texto">{t('portada.empezar.texto')}</p>
        <p className="cx-fila">
          <Link className="cx-boton" href={rutaEn(idioma, '/guia')}>{t('portada.empezar.guia')}</Link>
          <Link className="cx-boton cx-boton-sec" href={rutaEn(idioma, '/mis-grupos')}>{t('portada.empezar.grupos')}</Link>
        </p>
      </section>
      <PiePagina t={t} idioma={idioma} texto={t('home.foot')} />
    </main>
  );
}

const NINGUNO = '00000000-0000-0000-0000-000000000000';

async function Grupos() {
  const [{ t, idioma }, u] = await Promise.all([textos(), usuarioActual()]);
  const mios = new Map(u ? (await gruposDeUsuario(u.id)).map((g) => [g.id, g.rol]) : []);
  const lista = await db.select().from(grupos).where(or(eq(grupos.visible, true), inArray(grupos.id, mios.size ? [...mios.keys()] : [NINGUNO])));
  const filas = lista.length ? await db.select({ grupoId: raids.grupoId, visibilidad: raids.visibilidad, n: count(), ultima: max(raids.fecha) }).from(raids)
    .where(inArray(raids.grupoId, lista.map((g) => g.id))).groupBy(raids.grupoId, raids.visibilidad).orderBy(desc(max(raids.fecha))) : [];
  const resumen = new Map<string, { n: number; ultima: Date | null }>();
  for (const g of lista) {
    const rol = mios.get(g.id) ?? null;
    const visibles = filas.filter((f) => f.grupoId === g.id && apareceEnListados(f.visibilidad, g.visible, rol));
    const ultimas = visibles.map((f) => f.ultima).filter((d): d is Date => !!d);
    resumen.set(g.id, { n: visibles.reduce((s, f) => s + Number(f.n), 0), ultima: ultimas.length ? new Date(Math.max(...ultimas.map((d) => +d))) : null });
  }
  const ordenados = [...lista].sort((a, b) => (+(resumen.get(b.id)?.ultima ?? 0)) - (+(resumen.get(a.id)?.ultima ?? 0)));
  if (!ordenados.length) return <><p className="rx-pending">{t('portada.grupos.vacio')}</p><p className="rx-note">{t('portada.crear')}</p></>;
  const fecha = (d: Date) => d.toLocaleDateString(localeDe(idioma), { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <>
      <ul className="hm-list">
        {ordenados.map((g) => {
          const r = resumen.get(g.id)!;
          return (
            <li key={g.id} className="hm-item">
              <Link href={rutaEn(idioma, `/g/${g.slug}`)}>
                <div>
                  <div className="hm-name">{g.nombre}</div>
                  <div className="hm-sub">
                    <span>{r.n === 1 ? t('portada.raids1') : t('portada.raidsN', { n: r.n })}{r.ultima ? ` · ${t('portada.ultima', { d: fecha(r.ultima) })}` : ''}</span>
                    {mios.has(g.id) ? <span className="rx-pill is-ok">{t('portada.tuyo')}</span> : null}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="rx-note">{t('portada.crear')}</p>
    </>
  );
}
