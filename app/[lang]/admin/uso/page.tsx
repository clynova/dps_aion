// Panel interno de uso (fase 10): por grupo, raids nuevas frente al límite, análisis con IA, solicitudes y tokens; y
// el tamaño de la base. Solo para quien está en SITE_ADMINS (lib/limites.ts); para el resto es un 404.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { sql } from 'drizzle-orm';
import BarraSuperior from '@/components/BarraSuperior';
import { usuarioActual } from '@/lib/auth/sesion';
import { db } from '@/lib/db/client';
import { localeDe, rutaEn } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';
import { LIMITE_RAIDS, VENTANA_DIAS, esAdminSitio } from '@/lib/limites';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  return { title: t('uso.titulo'), robots: { index: false } };
}

export default async function Uso() {
  const { t } = await textos();
  return (
    <main className="rx">
      <Suspense fallback={<header className="rx-head"><BarraSuperior /><p className="rx-note">{t('raid.loading')}</p></header>}>
        <Contenido />
      </Suspense>
    </main>
  );
}

type Fila = {
  slug: string; nombre: string; visible: boolean; miembros: number; raids: number; nuevas: number; ultima: Date | null;
  ia: number; solicitudes: number; tokens: number; webhook: boolean;
};

async function Contenido() {
  const [{ t, idioma }, u] = await Promise.all([textos(), usuarioActual()]);
  if (!(await esAdminSitio(u?.id))) notFound();
  const dias = sql.raw(`interval '${VENTANA_DIAS} days'`);
  const [filas, total] = await Promise.all([
    db.execute<Fila>(sql`
      select g.slug, g.nombre, g.visible, g.discord_webhook_cifrado is not null as webhook,
        (select count(*)::int from miembros m where m.grupo_id = g.id) as miembros,
        (select count(*)::int from raids r where r.grupo_id = g.id) as raids,
        (select count(*)::int from auditoria a where a.grupo_id = g.id and a.accion = 'raid.subir' and a.creada > now() - ${dias}) as nuevas,
        (select max(r.publicado) from raids r where r.grupo_id = g.id) as ultima,
        (select count(*)::int from auditoria a where a.grupo_id = g.id and a.accion = 'analisis.ia' and a.creada > now() - ${dias}) as ia,
        (select count(*)::int from solicitudes s where s.grupo_id = g.id and s.creada > now() - ${dias}) as solicitudes,
        (select count(*)::int from tokens_api k where k.grupo_id = g.id and not k.revocado) as tokens
      from grupos g order by nuevas desc, raids desc, g.slug`),
    db.execute<{ usuarios: number; grupos: number; raids: number; bytes: string }>(sql`
      select (select count(*)::int from "user") as usuarios, (select count(*)::int from grupos) as grupos,
        (select count(*)::int from raids) as raids, pg_database_size(current_database())::text as bytes`),
  ]);
  const loc = localeDe(idioma);
  const nf = new Intl.NumberFormat(loc);
  const fecha = (d: Date | null) => (d ? new Date(d).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const tot = total.rows[0];
  return (
    <>
      <header className="rx-head">
        <BarraSuperior><Link className="rx-back" href={rutaEn(idioma, '/')}>{t('raid.back')}</Link></BarraSuperior>
        <h1 className="rx-title">{t('uso.titulo')}</h1>
        <p className="rx-lede">{t('uso.lede', { u: nf.format(tot.usuarios), g: nf.format(tot.grupos), r: nf.format(tot.raids), mb: nf.format(Math.round(Number(tot.bytes) / 1048576)) })}</p>
      </header>
      <section className="rx-section">
        <p className="rx-note">{t('uso.nota', { n: LIMITE_RAIDS, d: VENTANA_DIAS })}</p>
        <div className="rx-table-wrap">
          <table className="rx-table">
            <thead>
              <tr>
                <th>{t('uso.grupo')}</th><th>{t('uso.miembros')}</th><th>{t('uso.raids')}</th>
                <th>{t('uso.nuevas', { d: VENTANA_DIAS })}</th><th className="rx-left">{t('uso.ultima')}</th>
                <th>{t('uso.ia')}</th><th>{t('uso.solicitudes')}</th><th>{t('uso.tokens')}</th>
              </tr>
            </thead>
            <tbody>
              {filas.rows.map((f) => (
                <tr key={f.slug}>
                  <td>
                    <Link href={rutaEn(idioma, `/g/${f.slug}`)}>{f.nombre}</Link>{' '}
                    <span className="rx-note">/{f.slug}{f.visible ? '' : ` · ${t('uso.oculto')}`}{f.webhook ? ' · Discord' : ''}</span>
                  </td>
                  <td>{nf.format(f.miembros)}</td>
                  <td>{nf.format(f.raids)}</td>
                  <td style={f.nuevas >= LIMITE_RAIDS ? { color: 'var(--bad)' } : undefined}>{nf.format(f.nuevas)} / {LIMITE_RAIDS}</td>
                  <td className="rx-left">{fecha(f.ultima)}</td>
                  <td>{nf.format(f.ia)}</td>
                  <td>{nf.format(f.solicitudes)}</td>
                  <td>{nf.format(f.tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
