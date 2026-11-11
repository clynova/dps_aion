// Ficha de un jefe del módulo «Raids», en pestañas: Resumen (cifras, lo que hace wipe, consejos, dónde se atasca, qué
// mata, tu grupo, notas), Mecánicas (con sus cifras en vivo), Fases y tiempos (gráfico por % de vida, fases y
// cronograma), Equipo y grupo (GS, composición de los kills, crítico por clase y lo que dicen el juego y las guías), Por clase (habilidades, especialización más usada y defensivos) y Fuentes. El texto sale de contenido/raids/<raid>/<npc>.<idioma>.json; los datos (`datos`), de las raids
// públicas (lib/guia/datos-jefe.ts): undefined mientras cargan, null si no hay o la base falló. Sin datos se ve el texto.
import Link from 'next/link';
import { Fragment } from 'react';
import type { FichaJefe as Ficha } from '@/lib/guia/esquema';
import { ROLES } from '@/lib/guia/esquema';
import { fuentesDe, nombreAtaque } from '@/lib/guia/contenido';
import type { DatosJefeGuia } from '@/lib/guia/datos-jefe';
import { vidaRestante } from '@/lib/guia/datos-jefe';
import type { CifrasJefe } from '@/lib/guia/sumar-cifras';
import { localeDe, rutaEn, type Clave, type Idioma, type Traductor } from '@/lib/i18n';
import { formatoOpciones } from '@/lib/raids/especializaciones';
import LineaVida from './LineaVida';
import Pestanas from './Pestanas';
import { Afirmaciones, fechaLarga, Fuentes, Origen } from './Piezas';

export const PESTANAS_JEFE = ['resumen', 'mecanicas', 'fases', 'equipo', 'clases', 'fuentes'] as const;

type Props = {
  t: Traductor; idioma: Idioma; ficha: Ficha;
  /** GS de entrada de la raid por modo (de la ficha de la raid) */
  gsEntrada: { modo: string; valor: number }[];
  datos: DatosJefeGuia | null | undefined;
  /** Nombres de la base (apodos y habilidades) para los ataques de los datos */
  nombres: { apodos: Record<string, string>; habilidades: Record<string, string> } | null;
  cifras: CifrasJefe | null | undefined | 'error';
  tuGrupo: { slug: string; nombre: string; npc: number; raids: number }[];
};

export default function FichaJefe({ t, idioma, ficha, gsEntrada, datos, nombres, cifras, tuGrupo }: Props) {
  const loc = localeDe(idioma);
  const n0 = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  const n2 = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 });
  const n1 = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const nombre = (id: string) => nombres?.apodos[id] || nombres?.habilidades[id] || nombreAtaque(Number(id), idioma);
  const hab = (id: string) => `${t('q.open')}${nombre(id)}${t('q.close')}`;
  const min = (s: number) => t('jefe.min', { m: Math.floor(s / 60), s: String(Math.round(s % 60)).padStart(2, '0') });
  const mecanicas = [...ficha.mecanicas].sort((a, b) => Number(b.wipe) - Number(a.wipe));
  const wipes = mecanicas.filter((m) => m.wipe);
  const roles = ROLES.filter((r) => ficha.consejos[r]?.length);
  const c = cifras && cifras !== 'error' ? cifras : null;
  const tile = (etiqueta: string, valor: string, ok = false) => (
    <div className="rx-tile"><span className="rx-tile-label">{etiqueta}</span><span className={`rx-tile-value${ok ? ' is-ok' : ''}`}>{valor}</span></div>
  );
  const etiquetas = Object.fromEntries(PESTANAS_JEFE.map((p) => [p, t(`guias.tab.${p}` as Clave)]));

  return (
    <>
      <Pestanas ids={[...PESTANAS_JEFE]} etiquetas={etiquetas} aria={t('guias.tabs.aria')} />

      {/* ── Resumen ── */}
      <div className="pl-panel" id="resumen" data-pestana="resumen">
        <section className="rx-section">
          {cifras === undefined ? <p className="rx-note">{t('guias.cargando')}</p>
            : cifras === 'error' ? <p className="rx-pending">{t('guias.cifras.error')}</p>
              : !c ? <p className="rx-pending">{t('guias.cifras.vacio')}</p> : (
                <div className="rx-tiles">
                  {tile(t('guias.tile.noches'), n0.format(c.noches))}
                  {tile(t('guias.tile.intentos'), n0.format(c.intentos))}
                  {tile(t('guias.tile.kills'), n0.format(c.kills), c.kills > 0)}
                  {datos?.killMasRapido ? tile(t('guias.tile.rapido'), min(datos.killMasRapido), true) : null}
                  {tile(t('guias.tile.grupos'), n0.format(c.grupos))}
                </div>
              )}
          {c?.ultima ? <p className="rx-note">{t('guias.ultima', { f: fechaLarga(c.ultima, idioma) })} · {t('guias.cifras.nota')}</p> : null}
        </section>

        {wipes.length ? (
          <section className="rx-section">
            <h2 className="rx-h2">{t('guias.wipes.t')}</h2>
            <ul className="rx-card gx-afirmaciones">
              {wipes.map((m) => <li key={m.id}><a className="rx-link" href={`#m-${m.id}`}><strong>{m.titulo}</strong></a>: {m.como}</li>)}
            </ul>
          </section>
        ) : null}

        {datos ? (
          <section className="rx-section">
            <h2 className="rx-h2">{t('guias.mata.t')}</h2>
            <p className="rx-note">{t('guias.mata.nota', { n: n0.format(datos.intentos) })}</p>
            <div className="rx-card">
              {datos.atasco ? (
                <p className="cx-texto">
                  {t('guias.atasco', { a: datos.atasco.desde, b: datos.atasco.hasta, n: datos.atasco.wipes, de: datos.atasco.total })}
                  {datos.atasco.cierre ? <> {t('guias.atasco.cierre', { h: hab(datos.atasco.cierre) })}</> : null}
                </p>
              ) : null}
              <ol className="gx-mata">
                {datos.causas.map((x) => (
                  <li key={x.habilidad}>
                    <span>{nombre(x.habilidad)}</span>
                    <span className="gx-mata-barra" style={{ width: `${Math.max(4, (x.total / datos.causas[0].total) * 100)}%` }} aria-hidden="true" />
                    <span className="hm-sub">{t('guias.porIntento', { n: n2.format(x.porIntento) })}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        {roles.length ? (
          <section className="rx-section">
            <h2 className="rx-h2">{t('guias.consejos')}</h2>
            <div className="rx-grid">
              {roles.map((r) => (
                <div key={r} className="rx-card">
                  <h3>{t(`guias.rol.${r}` as Clave)}</h3>
                  <Afirmaciones t={t} items={ficha.consejos[r]!} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tuGrupo.length ? (
          <section className="rx-section">
            <h2 className="rx-h2">{t('guias.tugrupo.t')}</h2>
            <ul className="jx-jefes">
              {tuGrupo.map((g) => (
                <li key={g.slug}>
                  <Link href={rutaEn(idioma, `/g/${g.slug}/jefes/${g.npc}`)}>
                    <span className="hm-name">{g.nombre}</span>
                    <span className="hm-sub">{t(g.raids === 1 ? 'jefe.lista.raid1' : 'jefe.lista.raidN', { n: g.raids })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {ficha.notas.length ? (
          <section className="rx-section">
            <h2 className="rx-h2">{t('guias.notas')}</h2>
            <dl className="rx-card gx-notas">
              {ficha.notas.map((n) => <div key={n.termino}><dt>{n.termino}</dt><dd>{n.texto}</dd></div>)}
            </dl>
          </section>
        ) : null}
      </div>

      {/* ── Mecánicas ── */}
      <div className="pl-panel" id="mecanicas" data-pestana="mecanicas" hidden>
        <section className="rx-section">
          <p className="rx-note">{t('guias.mecanicas.nota')}</p>
          <div className="rx-grid">
            {mecanicas.map((m) => {
              const nombres = [...new Set(m.ataques.map((a) => nombre(String(a))))];
              const d = datos?.mecanicas[m.id];
              return (
                <article key={m.id} id={`m-${m.id}`} className={`rx-card gx-mecanica${m.wipe ? ' is-wipe' : ''}`}>
                  <h3>{m.titulo}</h3>
                  <p className="gx-chips">
                    {m.wipe ? <span className="rx-pill is-bad">{t('guias.wipe')}</span> : null}
                    <span className={`rx-pill gx-endatos is-${m.en_datos}`}>{t(`guias.endatos.${m.en_datos}` as Clave)}</span>
                    {m.roles.filter((r) => r !== 'todos').map((r) => <span key={r} className="rx-pill">{t(`guias.rol.${r}` as Clave)}</span>)}
                  </p>
                  <p className="cx-texto">{m.texto}</p>
                  <p className="cx-texto gx-como"><strong>{t('guias.como')}:</strong> {m.como}</p>
                  {d ? (
                    <p className="gx-datos">
                      {d.muertes ? t('guias.datos.muertes', { m: n0.format(d.muertes), p: n2.format(d.porIntento) }) : t('guias.datos.nomata')}
                      {d.momento ? <> {[t('guias.datos.momento', { v: n1.format(d.momento.vida), s: n0.format(d.momento.segundo) }), d.momento.porVida ? t('guias.datos.fijo') : null, d.momento.cadaS ? t('guias.datos.cada', { s: n0.format(d.momento.cadaS) }) : null].filter(Boolean).join(', ')} {t('guias.datos.de', { n: d.momento.intentos, de: d.momento.posibles })}</> : null}
                    </p>
                  ) : null}
                  {nombres.length ? <p className="hm-sub"><span>{t('guias.ataques')}:</span>{nombres.map((n) => <span key={n}>{t('q.open')}{n}{t('q.close')}</span>)}</p> : null}
                  <Origen t={t} origen={m.origen} fuentes={m.fuentes} />
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Fases y tiempos ── */}
      <div className="pl-panel" id="fases" data-pestana="fases" hidden>
        <section className="rx-section">
          <article className="rx-card">
            <h3>{t('guias.linea.t')}</h3>
            <p className="rx-note">{t('guias.linea.nota')}</p>
            <LineaVida t={t} fases={ficha.fases} muro={datos?.analisis.muro ?? []}
              marcas={(datos?.porVida ?? []).map((p) => ({ nombre: nombre(p.habilidad), vida: p.vida }))} />
            {datos?.porVida.length ? (
              <ol className="jx-marcas">
                {datos.porVida.map((p, k) => <li key={p.habilidad}><b>{String.fromCharCode(65 + k)}</b> {t('guias.linea.marca', { h: nombre(p.habilidad), v: n1.format(p.vida) })}</li>)}
              </ol>
            ) : null}
            {datos === null ? <p className="rx-note">{t('guias.sindatos')}</p> : null}
          </article>
        </section>

        {ficha.fases.length ? (
          <section className="rx-section">
            <h2 className="rx-h2">{t('guias.fases')}</h2>
            <ol className="gx-fases">
              {ficha.fases.map((f, i) => (
                <li key={i} className="rx-card">
                  <span className="gx-fase-rango">{t('guias.fase.rango', { d: f.desde_vida, h: f.hasta_vida })}</span>
                  <h3>{f.titulo}</h3>
                  <p className="cx-texto">{f.texto} <Origen t={t} origen={f.origen} fuentes={f.fuentes} /></p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {datos?.analisis.cronograma.length ? (
          <section className="rx-section">
            <h2 className="rx-h2">{t('guias.cro.t')}</h2>
            <article className="rx-card">
              <p className="rx-note">{t('guias.cro.nota', { n: n0.format(datos.analisis.totales.comparables) })}</p>
              <div className="rx-table-wrap">
                <table className="rx-table jx-cro">
                  <thead>
                    <tr><th>{t('jefe.cro.th.ataque')}</th><th>{t('jefe.cro.th.sale')}</th><th>{t('jefe.cro.th.s')}</th><th>{t('guias.cro.th.vida')}</th><th>{t('jefe.cro.th.repite')}</th></tr>
                  </thead>
                  <tbody>
                    {datos.analisis.cronograma.filter((x) => x.intentos >= Math.max(2, 0.3 * x.posibles)).map((x) => (
                      <tr key={x.habilidad} className={x.disparador ? `is-${x.disparador}` : undefined}>
                        <td>{nombre(x.habilidad)}</td>
                        <td>{t('jefe.cro.de', { n: x.intentos, de: x.posibles })}</td>
                        <td>{t('cmp.s', { n: n0.format(x.primeroS) })}</td>
                        <td>{t('cmp.pct', { n: n1.format(vidaRestante(x.primeroPct)) })}{x.disparador === 'vida' ? ` · ${t('guias.cro.porvida')}` : ''}</td>
                        <td>{x.cadaS !== null ? t('jefe.cro.cada', { s: t('cmp.s', { n: n0.format(x.cadaS) }) }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}
      </div>

      {/* ── Equipo y grupo ── */}
      <div className="pl-panel" id="equipo" data-pestana="equipo" hidden>
        <section className="rx-section">
          <h2 className="rx-h2">{t('guias.gs.t')}</h2>
          <div className="rx-tiles">
            {gsEntrada.map((g) => <Fragment key={g.modo}>{tile(t('guias.tile.gs', { modo: t(`guias.modo.${g.modo}` as Clave) }), n0.format(g.valor))}</Fragment>)}
            {datos?.equipo.gsKill ? (
              <div className="rx-tile">
                <span className="rx-tile-label">{t('guias.gs.kill')}</span>
                <span className="rx-tile-value is-ok">{t('guias.gs.rango', { a: n0.format(datos.equipo.gsKill.min), b: n0.format(datos.equipo.gsKill.max) })}</span>
                <span className="rx-tile-note">{t('guias.gs.nota', { m: n0.format(datos.equipo.gsKill.mediana), n: datos.equipo.gsKill.n })}</span>
              </div>
            ) : null}
            {datos?.equipo.gsTodos ? (
              <div className="rx-tile">
                <span className="rx-tile-label">{t('guias.gs.todos')}</span>
                <span className="rx-tile-value">{t('guias.gs.rango', { a: n0.format(datos.equipo.gsTodos.min), b: n0.format(datos.equipo.gsTodos.max) })}</span>
                <span className="rx-tile-note">{t('guias.gs.nota', { m: n0.format(datos.equipo.gsTodos.mediana), n: datos.equipo.gsTodos.n })}</span>
              </div>
            ) : null}
          </div>
        </section>

        {datos ? (
          <section className="rx-section">
            <h2 className="rx-h2">{t('guias.comp.t')}</h2>
            <p className="rx-note">{t('guias.comp.nota')}</p>
            {datos.equipo.kills.length ? (
              <ol className="rx-card gx-mata">
                {datos.equipo.clasesKill.map((c) => (
                  <li key={c.clase}>
                    <span>{t(`class.${c.clase}` as Clave)}</span>
                    <span className="gx-mata-barra is-ok" style={{ width: `${Math.max(4, (c.media / datos.equipo.clasesKill[0].media) * 100)}%` }} aria-hidden="true" />
                    <span className="hm-sub">{t('guias.comp.fila', { n: n1.format(c.media), k: c.kills, de: datos.equipo.kills.length })}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="rx-pending">{t('guias.comp.vacio')}</p>}
          </section>
        ) : null}

        {datos?.equipo.critico.length ? (
          <section className="rx-section">
            <h2 className="rx-h2">{t('guias.crit.t')}</h2>
            <p className="rx-note">{t('guias.crit.nota')}</p>
            <ol className="rx-card gx-mata">
              {datos.equipo.critico.map((c) => (
                <li key={c.clase}>
                  <span>{t(`class.${c.clase}` as Clave)} · {t('cmp.pct', { n: n1.format(c.mediana) })}</span>
                  <span className="gx-mata-barra is-crit" style={{ width: `${Math.max(4, c.mediana)}%` }} aria-hidden="true" />
                  <span className="hm-sub">{t('guias.crit.fila', { a: n1.format(c.min), b: n1.format(c.max), n: c.n })}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {ficha.equipo.length || ficha.requisitos.critico ? (
          <section className="rx-section">
            <h2 className="rx-h2">{t('guias.equipo.t')}</h2>
            <div className="rx-card">
              {ficha.requisitos.critico ? (
                <p className="cx-texto">
                  <strong>{t('guias.crit.rango', { a: n0.format(ficha.requisitos.critico.min), b: n0.format(ficha.requisitos.critico.max) })}</strong>{' '}
                  <Origen t={t} origen={ficha.requisitos.critico.origen} fuentes={ficha.requisitos.critico.fuentes} />
                </p>
              ) : null}
              <Afirmaciones t={t} items={ficha.equipo} />
            </div>
          </section>
        ) : null}
      </div>

      {/* ── Por clase ── */}
      <div className="pl-panel" id="clases" data-pestana="clases" hidden>
        <p className="rx-note">{t('guias.clases.nota')}</p>
        {datos?.porClase.length ? (
          <div className="rx-grid">
            {datos.porClase.map((c) => (
              <article key={c.clase} className="rx-card">
                <h3>{t(`class.${c.clase}` as Clave)}</h3>
                <p className="hm-sub">{t('guias.clases.registros', { n: c.registros, j: c.jugadores })}</p>
                <ol className="gx-mata gx-clase">
                  {c.habilidades.map((h) => (
                    <li key={h.habilidad}>
                      <span>{nombre(h.habilidad)}</span>
                      <span className="gx-mata-barra is-crit" style={{ width: `${Math.max(4, (h.cuota / c.habilidades[0].cuota) * 100)}%` }} aria-hidden="true" />
                      <span className="hm-sub">
                        {t('guias.clases.uso', { c: n1.format(h.cuota), u: n0.format(h.uso) })}
                        {h.especializacion ? ` · ${t('guias.clases.esp', { o: formatoOpciones(h.especializacion.opciones), v: h.especializacion.veces, d: h.especializacion.de })}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
                {c.muertes ? (
                  <p className="gx-datos">
                    {c.conDefensivo
                      ? t('guias.clases.def', { n: c.conDefensivo, de: c.muertes, h: c.defensivos.map((d) => hab(d.habilidad)).join(', ') })
                      : t('guias.clases.sindef', { de: c.muertes })}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : <p className="rx-pending">{datos === undefined ? t('guias.cargando') : t('guias.clases.vacio')}</p>}
      </div>

      {/* ── Fuentes ── */}
      <div className="pl-panel" id="fuentes" data-pestana="fuentes" hidden>
        <p className="rx-note">{t('guias.origen.leyenda')}</p>
        <Fuentes t={t} idioma={idioma} ids={fuentesDe(ficha)} />
      </div>
    </>
  );
}
