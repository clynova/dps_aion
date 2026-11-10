// Página de un jefe: todas las raids del grupo contra él (lib/raids/jefe.ts). Sale del servidor ya calculada y
// traducida, con los gráficos en SVG; no necesita JavaScript.
import Link from 'next/link';
import BarraSuperior from '@/components/BarraSuperior';
import GraficoAjustado from '@/components/jefe/GraficoAjustado';
import { localeDe, rutaEn, type Idioma, type Traductor } from '@/lib/i18n';
import { MIN_PCT, type AnalisisJefe, type AtaqueCronograma } from '@/lib/raids/jefe';

type NombresHab = { apodos: Record<string, string>; habilidades: Record<string, string>; npcs: Record<string, string> };
type Props = { t: Traductor; idioma: Idioma; grupo: { slug: string; nombre: string }; jefe: string; a: AnalisisJefe; nombres: NombresHab };

/** Ataques que salen en menos de esta parte de los intentos que llegaron hasta ellos van aparte, plegados */
const FRECUENTE = 0.3;
/** Columnas de noches en la tabla de causas */
const MAX_NOCHES = 8;

export default function PaginaJefe({ t, idioma, grupo, jefe, a, nombres }: Props) {
  const loc = localeDe(idioma);
  const n0 = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  const n1 = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const compacto = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
  const pct = (x: number) => t('cmp.pct', { n: n1.format(x) });
  const seg = (x: number) => t('cmp.s', { n: n0.format(x) });
  const min = (s: number) => t('jefe.min', { m: Math.floor(s / 60), s: String(Math.round(s % 60)).padStart(2, '0') });
  // La fecha y la hora del texto ISO (las de quien grabó), sin pasar por la zona horaria del servidor
  const dia = (f: string, conAno = false) => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', ...(conAno ? { year: 'numeric' } : {}), timeZone: 'UTC' })
    .format(new Date(`${f.slice(0, 10)}T12:00:00Z`));
  const hora = (f: string) => f.slice(11, 16);
  const nombreHab = (id: string) => nombres.apodos[id] || nombres.habilidades[id] || nombres.npcs[id] || id;
  const hab = (id: string) => t('q.open') + nombreHab(id) + t('q.close');
  const raid = (slug: string) => rutaEn(idioma, `/g/${grupo.slug}/raids/${slug}`);
  const T = a.totales;

  const frecuentes = a.cronograma.filter((c) => c.intentos >= Math.max(2, FRECUENTE * c.posibles));
  const raros = a.cronograma.filter((c) => !frecuentes.includes(c));
  const porVida = a.cronograma.filter((c) => c.disparador === 'vida' && c.primeroPct >= MIN_PCT).sort((x, y) => x.primeroPct - y.primeroPct);
  // «Dónde se atasca» (sin kill): el tramo con más wipes y, si cae en él (±2,5 %), el ataque que sale a ese % de vida
  const atasco = (() => {
    if (T.kill || !a.muro.some((m) => m.wipes)) return null;
    const tramo = a.muro.reduce((x, m) => (m.wipes > x.wipes ? m : x));
    const total = a.muro.reduce((s, m) => s + m.wipes, 0);
    const cerca = porVida.map((c, k) => ({ c, k, d: Math.abs(c.primeroPct - (tramo.desde + 2.5)) })).filter((x) => x.d <= 5).sort((x, y) => x.d - y.d);
    return { tramo, total, marca: cerca[0] ?? null };
  })();
  const nochesCausas = a.noches.slice(-MAX_NOCHES);
  const desde = a.noches.length - nochesCausas.length;

  const disparo = (c: AtaqueCronograma) => (c.disparador === 'tiempo' ? t('jefe.cro.tiempo', { s: seg(c.primeroS) })
    : c.disparador === 'vida' ? t('jefe.cro.vida', { p: pct(c.primeroPct) }) : t('jefe.cro.ninguno'));
  const filaCronograma = (c: AtaqueCronograma) => (
    <tr key={c.habilidad} className={c.disparador ? `is-${c.disparador}` : undefined}>
      <td>{nombreHab(c.habilidad)}</td>
      <td>{t('jefe.cro.de', { n: c.intentos, de: c.posibles })}</td>
      <td>{seg(c.primeroS)}</td>
      <td>{pct(c.primeroPct)}</td>
      <td>{disparo(c)}</td>
      <td>{c.cadaS !== null ? t('jefe.cro.cada', { s: seg(c.cadaS) }) : '—'}</td>
    </tr>
  );
  const tablaCronograma = (filas: AtaqueCronograma[]) => (
    <div className="rx-table-wrap">
      <table className="rx-table jx-cro">
        <thead>
          <tr>
            <th>{t('jefe.cro.th.ataque')}</th><th>{t('jefe.cro.th.sale')}</th><th>{t('jefe.cro.th.s')}</th><th>{t('jefe.cro.th.pct')}</th>
            <th>{t('jefe.cro.th.disparo')}</th><th>{t('jefe.cro.th.repite')}</th>
          </tr>
        </thead>
        <tbody>{filas.map(filaCronograma)}</tbody>
      </table>
    </div>
  );

  return (
    <main className="rx">
      <header className="rx-head">
        <BarraSuperior><Link className="rx-back" href={rutaEn(idioma, `/g/${grupo.slug}`)}>{t('jefe.volver', { g: grupo.nombre })}</Link></BarraSuperior>
        <p className="rx-eyebrow">{t('jefe.eyebrow')}</p>
        <h1 className="rx-title">{jefe}</h1>
        <p className="rx-lede">
          {T.kill ? t('jefe.lede.kill', { d: dia(T.kill.fecha, true) }) : t('jefe.lede.sinKill', { p: pct(T.mejor?.pct ?? 0) })}
        </p>
      </header>

      <section className="rx-tiles">
        <div className="rx-tile"><span className="rx-tile-label">{t('jefe.tile.raids')}</span><span className="rx-tile-value">{n0.format(T.noches)}</span></div>
        <div className="rx-tile">
          <span className="rx-tile-label">{t('jefe.tile.intentos')}</span><span className="rx-tile-value">{n0.format(T.intentos)}</span>
          {T.pulls ? <span className="rx-tile-note">{t('jefe.tile.pulls', { n: T.pulls })}</span> : null}
        </div>
        {T.mejor ? (
          <div className="rx-tile">
            <span className="rx-tile-label">{t(T.kill ? 'jefe.tile.kill' : 'jefe.tile.mejor')}</span>
            <span className={`rx-tile-value${T.kill ? ' is-ok' : ''}`}>{T.kill ? (T.kill.killS !== null ? min(T.kill.killS) : t('home.stat.kill')) : pct(T.mejor.pct)}</span>
            <Link className="rx-tile-note" href={raid((T.kill ?? T.mejor).slug)}>{dia((T.kill ?? T.mejor).fecha)}, {hora((T.kill ?? T.mejor).fecha)}</Link>
          </div>
        ) : null}
      </section>

      {atasco ? (
        <section className="rx-top" id="estado">
          <h2 className="rx-top-t">{t('jefe.estado.t')}</h2>
          <p className="pl-summary">
            {t('jefe.estado.muro', { a: atasco.tramo.desde, b: atasco.tramo.desde + 5, n: atasco.tramo.wipes, de: atasco.total })}
            {atasco.marca ? <> {t('jefe.estado.marca', { h: hab(atasco.marca.c.habilidad), l: String.fromCharCode(65 + atasco.marca.k), p: pct(atasco.marca.c.primeroPct) })}</> : null}
            {atasco.tramo.cierre ? <> {t('jefe.estado.cierre', { h: hab(atasco.tramo.cierre.habilidad), n: atasco.tramo.cierre.veces })}</> : null}
          </p>
          <a className="rx-link" href="#muro">{t('jefe.estado.ver')} →</a>
        </section>
      ) : null}

      <section className="rx-section" id="noches">
        <h2 className="rx-h2">{t('jefe.noches.t')}</h2>
        <article className="rx-card">
          <h3>{t('jefe.noches.grafico')}</h3>
          <p className="rx-note">{t('jefe.noches.nota')}</p>
          <GraficoNoches a={a} t={t} dia={dia} hora={hora} pct={pct} />
          <div className="rx-table-wrap">
            <table className="rx-table jx-noches">
              <thead>
                <tr>
                  <th>{t('jefe.th.raid')}</th><th>{t('jefe.th.intentos')}</th><th>{t('jefe.th.mejor')}</th><th>{t('jefe.th.mediana')}</th>
                  <th>{t('jefe.th.muertes')}</th><th>{t('jefe.th.dps')}</th>
                </tr>
              </thead>
              <tbody>
                {[...a.noches].reverse().map((n) => (
                  <tr key={n.slug}>
                    <td><Link className="rx-link" href={raid(n.slug)}>{dia(n.fecha)}, {hora(n.fecha)}</Link></td>
                    <td>{n0.format(n.intentos)}</td>
                    <td className={n.matado ? 'rx-seg-ok' : undefined}>{n.matado ? (n.killS !== null ? t('jefe.kill', { t: min(n.killS) }) : t('home.stat.kill')) : pct(n.mejor)}</td>
                    <td>{n.mediana !== null ? pct(n.mediana) : '—'}</td>
                    <td>{n.muertesPorIntento !== null ? n1.format(n.muertesPorIntento) : '—'}</td>
                    <td>{n.dpsGrupo !== null ? compacto.format(n.dpsGrupo) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {a.muro.length ? (
        <section className="rx-section" id="muro">
          <h2 className="rx-h2">{t('jefe.muro.t')}</h2>
          <article className="rx-card">
            <h3>{t('jefe.muro.grafico')}</h3>
            <p className="rx-note">{t('jefe.muro.nota', { n: a.muro.reduce((s, m) => s + m.wipes, 0) })}</p>
            <GraficoMuro a={a} t={t} marcas={porVida} />
            {porVida.length ? (
              <ol className="jx-marcas">
                {porVida.map((c, k) => (
                  <li key={c.habilidad}><b>{String.fromCharCode(65 + k)}</b> {t('jefe.muro.marca', { h: hab(c.habilidad), p: pct(c.primeroPct) })}</li>
                ))}
              </ol>
            ) : null}
            <div className="rx-table-wrap">
              <table className="rx-table jx-muro">
                <thead><tr><th>{t('jefe.muro.th.tramo')}</th><th>{t('jefe.muro.th.wipes')}</th><th>{t('jefe.muro.th.cierre')}</th></tr></thead>
                <tbody>
                  {a.muro.filter((m) => m.wipes).map((m) => (
                    <tr key={m.desde}>
                      <td>{t('jefe.muro.tramo', { a: m.desde, b: m.desde + 5 })}</td>
                      <td>{n0.format(m.wipes)}</td>
                      <td>{m.cierre ? t('jefe.muro.cierre', { h: hab(m.cierre.habilidad), n: m.cierre.veces }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {a.cronograma.length ? (
        <section className="rx-section" id="cronograma">
          <h2 className="rx-h2">{t('jefe.cro.t')}</h2>
          <article className="rx-card">
            <h3>{t('jefe.cro.tabla')}</h3>
            <p className="rx-note">{t('jefe.cro.nota', { n: T.comparables })}</p>
            {tablaCronograma(frecuentes)}
            {raros.length ? (
              <details className="jx-raros">
                <summary>{t('jefe.cro.raros', { n: raros.length })}</summary>
                {tablaCronograma(raros)}
              </details>
            ) : null}
          </article>
        </section>
      ) : null}

      {a.causas.length ? (
        <section className="rx-section" id="causas">
          <h2 className="rx-h2">{t('jefe.causas.t')}</h2>
          <article className="rx-card">
            <h3>{t('jefe.causas.tabla')}</h3>
            <p className="rx-note">{t(desde ? 'jefe.causas.notaUltimas' : 'jefe.causas.nota', { n: nochesCausas.length })}</p>
            <div className="rx-table-wrap">
              <table className="rx-table jx-causas">
                <thead>
                  <tr>
                    <th>{t('jefe.cro.th.ataque')}</th><th>{t('jefe.causas.th.total')}</th>
                    {nochesCausas.map((n) => <th key={n.slug}>{dia(n.fecha)}<small>{hora(n.fecha)}</small></th>)}
                  </tr>
                </thead>
                <tbody>
                  {a.causas.map((c) => (
                    <tr key={c.habilidad}>
                      <td>{nombreHab(c.habilidad)}</td>
                      <td>{n0.format(c.total)}</td>
                      {c.porNoche.slice(desde).map((x, k) => <td key={nochesCausas[k].slug}>{x === null ? '—' : n1.format(x)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      <p className="rx-foot">{t('jefe.pie')}</p>
    </main>
  );
}

const W = 720, H = 250, M = { t: 14, r: 12, b: 44, l: 44 };
const yPct = (p: number) => M.t + ((100 - p) / 100) * (H - M.t - M.b);
const Rejilla = ({ t }: { t: Traductor }) => (
  <>
    {[0, 25, 50, 75, 100].map((v) => (
      <g key={v}>
        <line x1={M.l} x2={W - M.r} y1={yPct(v)} y2={yPct(v)} className={v ? 'jx-grid' : 'jx-eje'} />
        <text x={M.l - 6} y={yPct(v)} dy="0.32em" textAnchor="end">{t('cmp.pct', { n: v })}</text>
      </g>
    ))}
  </>
);

/** Progreso de cada intento por noche: los intentos en gris, el mejor de cada noche unido por una línea, el kill en verde. */
function GraficoNoches({ a, t, dia, hora, pct }: { a: AnalisisJefe; t: Traductor; dia: (f: string) => string; hora: (f: string) => string; pct: (x: number) => string }) {
  const n = a.noches.length;
  const ancho = (W - M.l - M.r) / Math.max(n, 1);
  const x = (i: number) => M.l + (i + 0.5) * ancho;
  const cada = Math.ceil(n / 8);
  const mejores = a.noches.map((no, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yPct(no.mejor).toFixed(1)}`).join('');
  return (
    <GraficoAjustado ancho={W}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('jefe.noches.grafico')}>
        <Rejilla t={t} />
        {n > 1 ? <path d={mejores} className="jx-linea" /> : null}
        {a.noches.map((no, i) => (
          <g key={no.slug}>
            {no.progresos.map((p, k) => (
              <circle key={p.intento} cx={x(i) + ((k % 5) - 2) * Math.min(5, ancho / 12)} cy={yPct(p.pct)} r={3}
                className={p.matado ? 'jx-kill' : 'jx-intento'}>
                <title>{`${t('cmp.intento', { n: p.intento })}: ${p.matado ? t('home.stat.kill') : pct(p.pct)}`}</title>
              </circle>
            ))}
            <circle cx={x(i)} cy={yPct(no.mejor)} r={5} className={no.matado ? 'jx-kill' : 'jx-mejor'}>
              <title>{`${dia(no.fecha)}, ${hora(no.fecha)}: ${no.matado ? t('home.stat.kill') : pct(no.mejor)}`}</title>
            </circle>
            {i % cada === 0 ? (
              <text x={x(i)} y={H - M.b + 16} textAnchor="middle">
                <tspan x={x(i)}>{dia(no.fecha)}</tspan><tspan x={x(i)} dy="1.2em">{hora(no.fecha)}</tspan>
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </GraficoAjustado>
  );
}

/** Wipes por tramo de 5 % de vida quitada, con los ataques que salen a un % fijo marcados con una letra. */
function GraficoMuro({ a, t, marcas }: { a: AnalisisJefe; t: Traductor; marcas: AtaqueCronograma[] }) {
  const max = Math.max(1, ...a.muro.map((m) => m.wipes));
  const x = (p: number) => M.l + (p / 100) * (W - M.l - M.r);
  // Las letras de las marcas van en filas encima de las barras: una marca pegada a la anterior baja a la fila siguiente
  const ultimaX: number[] = [];
  const filas = marcas.map((c) => {
    let f = ultimaX.findIndex((u) => x(c.primeroPct) - u >= 14);
    if (f < 0) f = ultimaX.length;
    ultimaX[f] = x(c.primeroPct);
    return f;
  });
  const arriba = M.t + 12 * (marcas.length ? Math.max(...filas) + 1 : 0);
  const y = (v: number) => arriba + (1 - v / max) * (H - arriba - M.b);
  const pasos = max <= 5 ? Array.from({ length: max + 1 }, (_, k) => k) : [0, Math.round(max / 2), max];
  return (
    <GraficoAjustado ancho={W}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('jefe.muro.grafico')}>
        {pasos.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} className={v ? 'jx-grid' : 'jx-eje'} />
            <text x={M.l - 6} y={y(v)} dy="0.32em" textAnchor="end">{v}</text>
          </g>
        ))}
        {a.muro.filter((m) => m.wipes).map((m) => (
          <rect key={m.desde} x={x(m.desde) + 1} width={x(5) - x(0) - 2} y={y(m.wipes)} height={y(0) - y(m.wipes)} className="jx-barra" rx={2}>
            <title>{`${t('jefe.muro.tramo', { a: m.desde, b: m.desde + 5 })}: ${m.wipes}`}</title>
          </rect>
        ))}
        {marcas.map((c, k) => (
          <g key={c.habilidad}>
            <line x1={x(c.primeroPct)} x2={x(c.primeroPct)} y1={M.t + 12 * filas[k] + 2} y2={y(0)} className="jx-marca" />
            <text x={x(c.primeroPct)} y={M.t + 12 * filas[k]} textAnchor="middle" className="rx-strong">{String.fromCharCode(65 + k)}</text>
          </g>
        ))}
        {[0, 20, 40, 60, 80, 100].map((p) => (
          <text key={p} x={x(p)} y={H - M.b + 16} textAnchor="middle">{t('cmp.pct', { n: p })}</text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle">{t('jefe.muro.eje')}</text>
      </svg>
    </GraficoAjustado>
  );
}
