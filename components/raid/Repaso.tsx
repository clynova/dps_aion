// «Repaso de las muertes» de la página de una raid: cómo fue cada muerte en sus 10 s anteriores (lib/raids/repaso.ts).
// Sale del servidor ya calculado y traducido; no necesita JavaScript. Las raids extraídas antes del 9/11/2026 no traen
// el repaso y muestran un aviso.
import { localeDe, type Idioma, type Traductor } from '@/lib/i18n';
import { analizarRepaso, type Cuenta, type MuerteDato, type MuerteRepasada } from '@/lib/raids/repaso';
import Explicacion from '@/components/ui/Explicacion';
import NombreJugador from '@/components/raid/NombreJugador';

type Datos = { meta: unknown; detalle: Record<string, unknown> };
type NombresHab = { apodos: Record<string, string>; habilidades: Record<string, string> };

const ANCHO = 96, ALTO = 26;

/** Vida de los 10 s como línea escalonada (cada lectura vale hasta la siguiente) */
function trazo(curva: [number, number][]) {
  const x = (t: number) => Math.round(((t + 10) / 10) * (ANCHO - 2) * 10) / 10 + 1;
  const y = (p: number) => Math.round((ALTO - 2 - (Math.min(p, 100) / 100) * (ALTO - 4)) * 10) / 10;
  let d = `M${x(curva[0][0])},${y(curva[0][1])}`;
  for (const [t, p] of curva.slice(1)) d += `H${x(t)}V${y(p)}`;
  return `${d}H${x(0)}`;
}

export default function Repaso({ t, idioma, datos, nombres }: { t: Traductor; idioma: Idioma; datos: Datos; nombres: NombresHab }) {
  const grupo = (datos.meta as { grupo: string[] }).grupo;
  const muertesDe = Object.fromEntries(Object.entries(datos.detalle).map(([n, d]) => [n, (d as { muertes?: MuerteDato[] }).muertes ?? []]));
  const a = analizarRepaso(muertesDe, grupo);
  if (!a.total) return null;
  const titulo = <h2 className="rx-h2">{t('rep.titulo')}</h2>;
  if (!a.conRepaso) return <section className="rx-section" id="repaso">{titulo}<p className="rx-pending">{t('rep.sinDatos')}</p></section>;

  const loc = localeDe(idioma);
  const compacto = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const hab = (id: string) => (id ? nombres.apodos[id] || nombres.habilidades[id] || id : '—');
  const maxMuertes = Math.max(1, ...a.jugadores.map((j) => j.muertes));
  const tipo = (m: MuerteRepasada) => t(m.tipo === 'golpe' ? 'rep.th.golpe' : m.tipo === 'rafaga' ? 'rep.th.rafaga' : 'rep.th.desgaste');
  const celdas = (c: Cuenta) => (
    <>
      <td>{c.muertes}</td><td>{c.golpe || ''}</td><td>{c.rafaga || ''}</td><td>{c.desgaste || ''}</td>
      <td>{c.sinSanador || ''}</td><td>{c.grupoCaido || ''}</td><td>{c.conDefensivo || ''}</td>
    </>
  );
  const defensivo = (m: MuerteRepasada, id: string) => {
    const d = m.repaso.defensivos.find((x) => x.hab === id)!;
    return d.hace_s === null ? t('rep.def.nunca', { hab: hab(id) }) : t('rep.def.hace', { hab: hab(id), s: nf.format(d.hace_s), r: nf.format(d.recarga_s ?? 0) });
  };

  return (
    <section className="rx-section" id="repaso">
      {titulo}
      <article className="rx-card">
        <h3>{t('rep.tabla.t')}</h3>
        <Explicacion t={t} corto={t('rep.tabla.corto')} metodo={t('rep.tabla.nota')} />
        <p className="rx-rep-res">
          {t('rep.res', { n: a.grupo.muertes, g: a.grupo.golpe, p: t('cmp.pct', { n: nf.format(a.grupo.muertes ? (a.grupo.golpe / a.grupo.muertes) * 100 : 0) }), r: a.grupo.rafaga, d: a.grupo.desgaste })}
        </p>
        <div className="rx-legend">
          <span><i className="rx-key rx-key-critical"></i><span>{t('rep.th.golpe')}</span></span>
          <span><i className="rx-key rx-apil-key is-rafaga"></i><span>{t('rep.th.rafaga')}</span></span>
          <span><i className="rx-key rx-key-muted"></i><span>{t('rep.th.desgaste')}</span></span>
        </div>
        <ul className="rx-apil">
          {a.jugadores.map((j) => {
            const sin = Math.max(0, j.muertes - j.golpe - j.rafaga - j.desgaste);
            const tramos = [['golpe', j.golpe, 'rep.th.golpe'], ['rafaga', j.rafaga, 'rep.th.rafaga'], ['desgaste', j.desgaste, 'rep.th.desgaste'], ['sin', sin, 'rep.sin']] as const;
            const chips = [['rep.chip.sinSanador', j.sinSanador], ['rep.chip.grupoCaido', j.grupoCaido], ['rep.chip.defensivo', j.conDefensivo]] as const;
            return (
              <li key={j.jugador}>
                <span className="rx-apil-n"><NombreJugador n={j.jugador} /></span>
                <span className="rx-apil-pista">
                  <span className="rx-apil-barra" style={{ width: `${(j.muertes / maxMuertes) * 100}%` }} role="img"
                    aria-label={t('rep.barra.aria', { j: j.jugador, n: j.muertes, g: j.golpe, r: j.rafaga, d: j.desgaste })}>
                    {tramos.filter(([, n]) => n > 0).map(([k, n, clave]) => <i key={k} className={`is-${k}`} style={{ flexGrow: n }} title={`${t(clave)}: ${n}`} />)}
                  </span>
                  <span className="rx-apil-v">{j.muertes}</span>
                </span>
                {chips.some(([, n]) => n > 0) ? (
                  <span className="rx-apil-chips">
                    {chips.filter(([, n]) => n > 0).map(([clave, n]) => <span key={clave} className={`rx-pill${clave === 'rep.chip.defensivo' ? ' is-bad' : ''}`}>{t(clave, { n })}</span>)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <details className="rx-details">
          <summary>{t('ui.verTabla')}</summary>
          <div className="rx-table-wrap">
            <table className="rx-table rx-rep-tabla">
              <thead>
                <tr>
                  <th>{t('th.player')}</th><th>{t('th.deaths')}</th><th>{t('rep.th.golpe')}</th><th>{t('rep.th.rafaga')}</th><th>{t('rep.th.desgaste')}</th>
                  <th>{t('rep.th.sinSanador')}</th><th>{t('rep.th.grupoCaido')}</th><th>{t('rep.th.defensivo')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="rx-rep-total"><td>{t('rep.total')}</td>{celdas(a.grupo)}</tr>
                {a.jugadores.map((j) => <tr key={j.jugador}><td><NombreJugador n={j.jugador} /></td>{celdas(j)}</tr>)}
              </tbody>
            </table>
          </div>
        </details>
        {a.conRepaso < a.total ? <p className="rx-note">{t('rep.parcial', { n: a.conRepaso, de: a.total })}</p> : null}
      </article>

      <article className="rx-card">
        <h3>{t('rep.lista.t')}</h3>
        <Explicacion t={t} corto={t('rep.lista.corto')} metodo={t('rep.lista.nota')} />
        {a.intentos.map((i) => (
          <details className="rx-details rx-rep-intento" key={i.intento}>
            <summary>{t('rep.intento', { n: i.intento, m: i.muertes.length, j: i.muertes[0].jugador, s: i.muertes[0].t, hab: hab(i.muertes[0].habilidad) })}</summary>
            <div className="rx-table-wrap">
              <table className="rx-table rx-rep">
                <thead>
                  <tr>
                    <th>{t('f.th.sec')}</th><th>{t('th.player')}</th><th>{t('rep.th.causa')}</th><th>{t('rep.th.tipo')}</th>
                    <th>{t('rep.th.vida')}</th><th>{t('rep.th.recibio')}</th><th>{t('rep.th.cura')}</th><th>{t('rep.th.vivos')}</th>
                  </tr>
                </thead>
                <tbody>
                  {i.muertes.map((m, k) => {
                    const r = m.repaso;
                    const sanan = [...new Set(r.curas.map((c) => c.jugador).filter(Boolean))];
                    return (
                      <tr key={k}>
                        <td>{m.t}</td>
                        <td><NombreJugador n={m.jugador} /></td>
                        <td>{hab(m.habilidad)}{m.golpe_max ? <small>{t('rep.final', { d: compacto.format(m.golpe_max) })}</small> : null}</td>
                        <td><span className={`rx-rep-t is-${m.tipo}`}>{tipo(m)}</span></td>
                        <td>
                          <svg className="rx-rep-vida" viewBox={`0 0 ${ANCHO} ${ALTO}`} width={ANCHO} height={ALTO} role="img"
                            aria-label={t('rep.vida.aria', { a: r.vida_10s, b: m.vidaAntes })}>
                            <line x1="1" x2={ANCHO - 1} y1={ALTO - 2} y2={ALTO - 2} />
                            <path d={trazo(m.curva)} />
                          </svg>
                          <small>{t('rep.vida', { a: r.vida_10s, b: m.vidaAntes })}</small>
                        </td>
                        <td>
                          {t(r.golpes_10s === 1 ? 'rep.dano1' : 'rep.dano', { n: r.golpes_10s, d: compacto.format(r.dano_10s) })}
                          {r.escudo_10s ? <small>{t('rep.escudo', { e: compacto.format(r.escudo_10s) })}</small> : null}
                          {m.libres.length ? <small className="rx-rep-libre">{t('rep.def', { l: m.libres.map((id) => defensivo(m, id)).join('; ') })}</small> : null}
                        </td>
                        <td>
                          {r.cura_10s ? compacto.format(r.cura_10s) : t('rep.cura.nada')}
                          {sanan.length ? <small>{t('rep.cura.de', { q: sanan.join(', ') })}</small> : null}
                        </td>
                        <td>
                          {t('rep.vivos', { n: r.vivos, de: r.companeros })}
                          <small className={m.sinSanador ? 'rx-rep-libre' : undefined}>{m.sinSanador ? t('rep.sanadores.0') : t('rep.sanadores', { n: r.sanadores })}</small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </article>
    </section>
  );
}
