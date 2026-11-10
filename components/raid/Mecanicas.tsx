// «Fallos de mecánica» de la página de una raid: quién recibe golpes que sus compañeros evitan (lib/raids/mecanicas.ts).
// Sale del servidor ya calculado y traducido; no necesita JavaScript. Las raids extraídas antes del 9/11/2026 no traen
// «mecanicas» y muestran un aviso.
import type { CSSProperties } from 'react';
import { localeDe, type Idioma, type Traductor } from '@/lib/i18n';
import { analizarMecanicas, type Celda, type MecanicaDato } from '@/lib/raids/mecanicas';
import Explicacion from '@/components/ui/Explicacion';

type Datos = {
  meta: unknown; causas: { habilidad: string; muertes: number }[]; detalle: Record<string, unknown>; mecanicas?: MecanicaDato[];
};
type NombresHab = { apodos: Record<string, string>; habilidades: Record<string, string> };

/** Color de la casilla: hasta un 55 % del tono de la serie cuando el ataque le da siempre */
const tinte = (tasa: number | null) => ({ '--mec': `${Math.round((tasa ?? 0) * 55)}%` }) as CSSProperties;

export default function Mecanicas({ t, idioma, datos, nombres }: { t: Traductor; idioma: Idioma; datos: Datos; nombres: NombresHab }) {
  const titulo = <h2 className="rx-h2">{t('mec.titulo')}</h2>;
  if (!datos.mecanicas?.length) {
    return <section className="rx-section" id="mec">{titulo}<p className="rx-pending">{t('mec.sinDatos')}</p></section>;
  }
  const grupo = (datos.meta as { grupo: string[] }).grupo;
  const muertesDe = Object.fromEntries(Object.entries(datos.detalle).map(([n, d]) => [n, (d as { muertes?: { habilidad: string }[] }).muertes ?? []]));
  const a = analizarMecanicas(datos.mecanicas, grupo, datos.causas, muertesDe);
  const nf = new Intl.NumberFormat(localeDe(idioma), { maximumFractionDigits: 1 });
  const hab = (id: string) => nombres.apodos[id] || nombres.habilidades[id] || id;
  const dif = (indice: number) => { const p = Math.round((indice - 1) * 100); return t('mec.pct', { n: (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p) }); };

  const comparables = a.ataques.filter((x) => x.clase === 'selectivo' || x.clase === 'objetivo').sort((x, y) => y.muertes - x.muertes || y.golpes - x.golpes);
  const resto = a.ataques.filter((x) => x.clase === 'todos' || x.clase === 'escaso');
  const orden = a.jugadores.map((j) => j.jugador); // columnas en el orden de la tabla de arriba
  const celdaDe = (x: (typeof comparables)[number], jugador: string) => x.celdas.find((c) => c.jugador === jugador)!;
  const ayuda = (c: Celda) => {
    const v = { j: c.jugador, n: c.olas, de: c.expuesto, esp: nf.format(c.esperado) };
    if (!c.expuesto) return t('mec.celda.nada', v);
    if (c.objetivo) return t('mec.celda.objetivo', v);
    return t(c.nivel === 'alto' ? 'mec.celda.alto' : c.nivel === 'bajo' ? 'mec.celda.bajo' : 'mec.celda', v);
  };

  // Arriba, quien recibe de más (o destaca en algún ataque); los demás, en una línea. La tabla entera, plegada.
  const destacan = a.jugadores.filter((j) => j.altos.length || (j.indice ?? 0) >= 1.3);
  const tranquilos = a.jugadores.filter((j) => !destacan.includes(j));
  // La matriz enseña primero los ataques en los que a alguien le da bastante más que al resto
  const conAlto = comparables.filter((x) => x.celdas.some((c) => c.nivel === 'alto' && !c.objetivo));
  const otros = comparables.filter((x) => !conAlto.includes(x));
  const matriz = (filas: typeof comparables) => (
    <div className="rx-table-wrap">
      <table className="rx-table rx-mec">
        <thead>
          <tr>
            <th>{t('mec.th.ataque')}</th><th>{t('mec.th.veces')}</th><th>{t('th.deaths')}</th>
            {orden.map((n) => <th key={n} className="rx-mec-j" title={n}>{n}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((x) => (
            <tr key={x.habilidad}>
              <td>{hab(x.habilidad)}</td>
              <td>{x.olas}</td>
              <td>{x.muertes || ''}</td>
              {orden.map((n) => {
                const c = celdaDe(x, n);
                if (!c.expuesto) return <td key={n} title={ayuda(c)}><span className="rx-mec-c is-nada">–</span></td>;
                if (c.objetivo) return <td key={n} title={ayuda(c)}><span className="rx-mec-c is-obj">{c.olas}/{c.expuesto} ◎</span></td>;
                return (
                  <td key={n} title={ayuda(c)}>
                    <span className={`rx-mec-c${c.nivel === 'alto' ? ' is-alto' : ''}`} style={tinte(c.tasa)}>
                      {c.olas}/{c.expuesto}{c.nivel === 'alto' ? ' ▲' : c.nivel === 'bajo' ? ' ▽' : ''}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="rx-section" id="mec">
      {titulo}
      {comparables.length ? (
        <>
          <article className="rx-card">
            <h3>{t('mec.rank.t')}</h3>
            <Explicacion t={t} corto={t('mec.rank.corto')} metodo={t('mec.rank.nota')} />
            {destacan.length ? (
              <ul className="rx-dest">
                {destacan.map((j) => {
                  const p = j.indice === null ? null : Math.round((j.indice - 1) * 100);
                  return (
                    <li key={j.jugador}>
                      <span className="rx-dest-n">{j.jugador}</span>
                      <span className="rx-div" aria-hidden="true">
                        {p ? <i className={p > 0 ? 'is-mas' : 'is-menos'} style={{ width: `${Math.min(Math.abs(p), 100) / 2}%` }} /> : null}
                      </span>
                      <span className={`rx-dest-v${(j.indice ?? 0) >= 1.3 ? ' is-alto' : ''}`}>
                        {j.indice === null ? '—' : <>{j.indice >= 1.3 ? <span aria-hidden="true">▲ </span> : j.indice <= 0.75 ? <span aria-hidden="true">▽ </span> : null}{dif(j.indice)}</>}
                      </span>
                      <span className="rx-dest-det">{t('mec.det', { r: j.recibidos, e: nf.format(j.esperados), m: j.muertes })}</span>
                      {j.altos.length ? (
                        <span className="rx-dest-chips">
                          {j.altos.slice(0, 4).map((id) => {
                            const c = a.ataques.find((x) => x.habilidad === id)!.celdas.find((x) => x.jugador === j.jugador)!;
                            return <span key={id} className="rx-pill is-bad">{hab(id)} {c.olas}/{c.expuesto}</span>;
                          })}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {tranquilos.length ? (
              <p className="rx-note">{t('mec.nadaDestaca', { l: tranquilos.map((j) => (j.indice === null ? j.jugador : `${j.jugador} (${dif(j.indice)})`)).join(', ') })}</p>
            ) : null}
            <details className="rx-details">
              <summary>{t('ui.verTabla')}</summary>
              <div className="rx-table-wrap">
                <table className="rx-table rx-mec-rank">
                  <thead>
                    <tr>
                      <th>{t('th.player')}</th><th>{t('mec.th.recibidos')}</th><th>{t('mec.th.esperados')}</th><th>{t('mec.th.diferencia')}</th>
                      <th>{t('mec.th.muertes')}</th><th>{t('mec.th.donde')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.jugadores.map((j) => (
                      <tr key={j.jugador}>
                        <td>{j.jugador}</td>
                        <td>{j.recibidos}</td>
                        <td>{nf.format(j.esperados)}</td>
                        <td>{j.indice === null ? '—' : <>{j.indice >= 1.3 ? <span aria-hidden="true">▲ </span> : j.indice <= 0.75 ? <span aria-hidden="true">▽ </span> : null}{dif(j.indice)}</>}</td>
                        <td>{j.muertes}</td>
                        <td>{j.altos.length ? j.altos.slice(0, 4).map((id) => {
                          const c = a.ataques.find((x) => x.habilidad === id)!.celdas.find((x) => x.jugador === j.jugador)!;
                          return `${hab(id)} (${c.olas}/${c.expuesto})`;
                        }).join(' · ') : <span className="rx-note">{t('mec.sinDestacar')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </article>

          <article className="rx-card">
            <h3>{t('mec.mapa.t')}</h3>
            <Explicacion t={t} corto={t('mec.mapa.corto')} metodo={t('mec.mapa.nota')} />
            {conAlto.length && otros.length ? <p className="rx-note">{t('mec.mapa.solo', { n: conAlto.length, de: comparables.length })}</p> : null}
            {matriz(conAlto.length ? conAlto : comparables)}
            {conAlto.length && otros.length ? (
              <details className="rx-details">
                <summary>{t('mec.mapa.otros', { n: otros.length })}</summary>
                {matriz(otros)}
              </details>
            ) : null}
          </article>
        </>
      ) : <p className="rx-pending">{t('mec.vacio')}</p>}

      {resto.length ? (
        <details className="rx-details">
          <summary>{t('mec.resto', { n: resto.length })}</summary>
          <div className="rx-table-wrap">
            <table className="rx-table rx-mec-resto">
              <thead>
                <tr><th>{t('mec.th.ataque')}</th><th>{t('mec.th.tipo')}</th><th>{t('mec.th.veces')}</th><th>{t('mec.th.alcance')}</th><th>{t('th.deaths')}</th></tr>
              </thead>
              <tbody>
                {resto.map((x) => (
                  <tr key={x.habilidad}>
                    <td>{hab(x.habilidad)}</td><td>{t(x.clase === 'todos' ? 'mec.tipo.todos' : 'mec.tipo.escaso')}</td>
                    <td>{x.olas}</td><td>{t('mec.alcance', { n: nf.format(x.alcance), de: nf.format(x.vivos) })}</td><td>{x.muertes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}
