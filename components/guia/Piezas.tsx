// Piezas comunes del módulo «Raids» (docs/plan-guia-raids.md): de dónde sale cada dato, listas de afirmaciones,
// fuentes y la lista de jefes con las cifras públicas. Todo sale del servidor, sin JavaScript.
import Link from 'next/link';
import type { CifrasJefe } from '@/lib/guia/sumar-cifras';
import { fuenteGuia, jefeJuego, nombreJefe, parchesPosteriores, urlRetrato, type RaidGuia } from '@/lib/guia/contenido';
import type { Origen as TipoOrigen } from '@/lib/guia/esquema';
import { localeDe, rutaEn, type Clave, type Idioma, type Traductor } from '@/lib/i18n';

type Base = { t: Traductor; idioma: Idioma };

/** Fecha AAAA-MM-DD (o ISO) como «10 de noviembre de 2026», sin pasar por la zona del servidor. */
export function fechaLarga(f: string, idioma: Idioma) {
  return new Intl.DateTimeFormat(localeDe(idioma), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${f.slice(0, 10)}T12:00:00Z`));
}

/** Etiqueta del origen y enlaces a sus fuentes. */
export function Origen({ t, origen, fuentes }: { t: Traductor; origen: TipoOrigen; fuentes: string[] }) {
  return (
    <span className="gx-origen">
      <span className={`gx-tag is-${origen}`}>{t(`guias.origen.${origen}` as Clave)}</span>
      {fuentes.map((id) => {
        const f = fuenteGuia(id);
        if (!f) return null;
        return f.url
          ? <a key={id} className="gx-fuente" href={f.url} target="_blank" rel="noopener noreferrer" title={f.titulo}>{f.sitio}</a>
          : <span key={id} className="gx-fuente" title={f.titulo}>{f.sitio}</span>;
      })}
    </span>
  );
}

type Afirmacion = { texto: string; origen: TipoOrigen; fuentes: string[] };

export function Afirmaciones({ t, items }: { t: Traductor; items: Afirmacion[] }) {
  return (
    <ul className="gx-afirmaciones">
      {items.map((a, i) => <li key={i}><span>{a.texto}</span> <Origen t={t} origen={a.origen} fuentes={a.fuentes} /></li>)}
    </ul>
  );
}

const ORIGEN_DE_TIPO = { juego: 'juego', 'base-de-datos': 'juego', oficial: 'oficial', guia: 'guias', foro: 'guias' } as const;

/** Fuentes citadas en una ficha, con fecha de consulta. */
export function Fuentes({ t, idioma, ids }: Base & { ids: string[] }) {
  const lista = [...new Set(ids)].map(fuenteGuia).filter((f): f is NonNullable<typeof f> => !!f);
  if (!lista.length) return null;
  return (
    <section className="rx-section">
      <h2 className="rx-h2">{t('guias.fuentes')}</h2>
      <p className="rx-note">{t('guias.fuentes.nota')}</p>
      <ul className="rx-card gx-fuentes">
        {lista.map((f) => (
          <li key={f.id}>
            {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.titulo}</a> : <span>{f.titulo}</span>}
            <span className="hm-sub">
              <span>{f.sitio}</span>
              <span>{t(`guias.origen.${ORIGEN_DE_TIPO[f.tipo]}` as Clave)}</span>
              <span>{t('guias.consultado', { f: fechaLarga(f.consultado, idioma) })}</span>
            </span>
            {f.nota ? <span className="rx-note">{f.nota[idioma]}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Cifras de un jefe o de una raid en una línea: noches, intentos y kills (undefined: cargando; 'error': la base falló). */
export function LineaCifras({ t, idioma, c }: Base & { c: CifrasJefe | null | undefined | 'error' }) {
  if (c === undefined) return <span className="hm-sub">{t('guias.cargando')}</span>;
  if (c === 'error') return <span className="hm-sub">{t('guias.cifras.error')}</span>;
  if (!c) return <span className="hm-sub">{t('guias.cifras.vacio')}</span>;
  const n0 = new Intl.NumberFormat(localeDe(idioma));
  return (
    <span className="hm-sub">
      <span>{t(c.noches === 1 ? 'guias.noche1' : 'guias.nocheN', { n: n0.format(c.noches) })}</span>
      <span>{t(c.intentos === 1 ? 'guias.intento1' : 'guias.intentoN', { n: n0.format(c.intentos) })}</span>
      {c.kills ? <span className="rx-seg-ok">{t(c.kills === 1 ? 'guias.kill1' : 'guias.killN', { n: n0.format(c.kills) })}</span> : null}
    </span>
  );
}

/** Lista de jefes de una raid, con retrato y cifras (undefined mientras cargan, null si la base falló). */
export function ListaJefes({ t, idioma, raid, jefes, cifras }: Base & { raid: string; jefes: number[]; cifras: Map<string, CifrasJefe> | null | undefined }) {
  return (
    <ul className="jx-jefes gx-jefes">
      {jefes.map((npc) => {
        const retrato = urlRetrato(jefeJuego(npc)?.retrato);
        return (
          <li key={npc}>
            <Link href={rutaEn(idioma, `/guias/${raid}/${npc}`)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- retrato pequeño del CDN de questlog.gg, sin optimizar */}
              {retrato ? <img className="gx-retrato" src={retrato} alt="" width={48} height={48} /> : <span className="gx-retrato" aria-hidden="true" />}
              <span className="gx-jefe-texto">
                <span className="hm-name">{nombreJefe(npc, idioma)}</span>
                <LineaCifras t={t} idioma={idioma} c={cifras === undefined ? undefined : cifras === null ? 'error' : (cifras.get(String(npc)) ?? null)} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Jugadores y modos de una raid, con su GS de entrada. */
export function Modos({ t, idioma, raid }: { t: Traductor; idioma: Idioma; raid: RaidGuia }) {
  const n0 = new Intl.NumberFormat(localeDe(idioma));
  const r = raid.es;
  return (
    <span className="hm-sub">
      <span>{t('guias.jugadores', { n: r.jugadores })}</span>
      {r.mazmorras.map((m) => (
        <span key={m.id}>{t(`guias.modo.${m.modo}`)}{r.gs[m.modo] ? ` · ${t('guias.gs', { n: n0.format(r.gs[m.modo]!.valor) })}` : ''}</span>
      ))}
    </span>
  );
}

/** Aviso «puede estar desactualizada» si hay un parche que toca la raid posterior a la ficha (`desde` = su parche). */
export function AvisoParche({ t, idioma, raid, desde }: Base & { raid: string; desde: string }) {
  const ps = parchesPosteriores(raid, desde);
  if (!ps.length) return null;
  const p = ps[ps.length - 1];
  return (
    <p className="rx-pending gx-revisar">
      {t('guias.revisar.parche', { f: fechaLarga(p.fecha, idioma), titulo: p.titulo[idioma], p: fechaLarga(desde, idioma) })}{' '}
      <Origen t={t} origen="oficial" fuentes={p.fuentes} />
    </p>
  );
}
