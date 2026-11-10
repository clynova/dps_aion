// «Contra el mejor intento» de la página de una raid: en qué punto se separa cada intento del kill (o del que más lejos
// llegó) y por qué, comparados a igual progreso (lib/raids/intentos.ts). Sale del servidor ya calculado y traducido; no
// necesita JavaScript. Usa datos que traen todas las raids (intentos, curva y muertes), también las antiguas.
import { Fragment } from 'react';
import { localeDe, type Clave, type Idioma, type Traductor } from '@/lib/i18n';
import { compararIntentos, type FilaIntento, type IntentoDato, type MuerteDato, type PuntoCurva } from '@/lib/raids/intentos';
import Explicacion from '@/components/ui/Explicacion';

type Datos = { meta: unknown; intentos?: IntentoDato[]; curva?: PuntoCurva[]; detalle?: Record<string, unknown> };
type NombresHab = { apodos: Record<string, string>; habilidades: Record<string, string>; npcs: Record<string, string> };

export default function Intentos({ t, idioma, datos, nombres }: { t: Traductor; idioma: Idioma; datos: Datos; nombres: NombresHab }) {
  const grupo = (datos.meta as { grupo: string[] }).grupo;
  const c = datos.intentos && datos.curva ? compararIntentos(datos.intentos, datos.curva,
    Object.fromEntries(Object.entries(datos.detalle ?? {}).map(([n, d]) => [n, (d as { muertes?: MuerteDato[] }).muertes ?? []])), grupo) : null;
  if (!c || !c.cuentas.comparables) return null;

  const nf = new Intl.NumberFormat(localeDe(idioma), { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(localeDe(idioma), { maximumFractionDigits: 1 });
  const s = (x: number) => t('cmp.s', { n: nf.format(x) });
  const muertes = (n: number | null) => (n === null ? '—' : t(n === 1 ? 'cmp.muerte1' : 'cmp.muertes', { n }));
  const hab = (id: string | null) => {
    const n = id ? nombres.apodos[id] || nombres.habilidades[id] || nombres.npcs[id] : null;
    return n ? t('q.open') + n + t('q.close') : id || t('cmp.desconocido');
  };
  const ref = c.referencia;
  const refNombre = t('cmp.intento', { n: ref.intento });
  const comparables = c.intentos.filter((f) => !f.corto);
  const cortos = c.intentos.filter((f) => f.corto);
  const separa = (f: FilaIntento) => f.separa ? (
    <span className="rx-pill is-bad">{t(`cmp.motivo.${f.separa.motivo}`, { p: f.separa.pct })}</span>
  ) : <span className="rx-pill">{t('cmp.motivo.ninguno', { p: f.comun!.pct })}</span>;
  const enPunto = (f: FilaIntento) => {
    const p = f.separa ?? f.comun!;
    return (
      <>
        {t('cmp.punto', { s: s(p.s), m: muertes(p.muertes) })}
        <small>{t('cmp.puntoRef', { i: ref.intento, s: s(p.sRef), m: muertes(p.muertesRef) })}</small>
      </>
    );
  };
  const repartos: [Clave, number][] = [
    ['cmp.cuenta.muertes', c.cuentas.muertes], ['cmp.cuenta.ritmo', c.cuentas.ritmo], ['cmp.cuenta.ambos', c.cuentas.ambos], ['cmp.cuenta.ninguno', c.cuentas.ninguno],
  ];
  const repetidos = c.jugadores.filter((j) => j.intentos.length >= 2);

  return (
    <section className="rx-section" id="contra-el-mejor">
      <h2 className="rx-h2">{t('cmp.titulo')}</h2>
      <article className="rx-card">
        <h3>{t('cmp.sep.t')}</h3>
        <Explicacion t={t}
          corto={<>{t(ref.matado ? 'cmp.sep.notaKill' : 'cmp.sep.notaMejor', { i: ref.intento, p: nf1.format(ref.progreso) })} {t('cmp.sep.corto')}</>}
          metodo={t('cmp.sep.nota')} />
        <p className="rx-cmp-cuentas">
          {t('cmp.cuenta', { n: c.cuentas.comparables })}{' '}
          {repartos.filter(([, n]) => n > 0).map(([k, n]) => <span key={k} className="rx-pill">{t(k, { n })}</span>)}
        </p>
        <div className="rx-table-wrap">
          <table className="rx-table rx-cmp">
            <thead>
              <tr>
                <th>{t('cmp.th.intento')}</th><th>{t('cmp.th.llego')}</th><th>{t('cmp.th.separa')}</th><th>{t('cmp.th.punto')}</th>
                <th>{t('cmp.th.antes')}</th><th>{t('cmp.th.despues')}</th>
              </tr>
            </thead>
            <tbody>
              {comparables.map((f) => (
                <tr key={f.intento}>
                  <td>{f.intento}</td>
                  <td>{t('cmp.pct', { n: nf1.format(f.progreso) })}</td>
                  <td>{separa(f)}</td>
                  <td>{enPunto(f)}</td>
                  <td>
                    {f.caidas.length ? f.caidas.map((x, i) => (
                      <Fragment key={x.jugador}>{i ? ', ' : ''}{x.jugador} <small className="rx-cmp-en">{t('cmp.caida', { s: s(x.t), h: hab(x.habilidad) })}</small></Fragment>
                    )) : <span className="rx-cmp-nadie">{t('cmp.nadie')}</span>}
                    {f.causa ? <small>{t('cmp.causa', { h: hab(f.causa.habilidad), n: f.causa.muertes, i: ref.intento, r: f.causa.ref })}</small> : null}
                  </td>
                  <td>
                    {f.despues ? (
                      <>
                        {t('cmp.despues', { s: s(f.despues.s), m: muertes(f.despues.muertes) })}
                        {f.despues.habilidad ? <small>{t('cmp.despuesHab', { h: hab(f.despues.habilidad), n: f.despues.deEse })}</small> : null}
                      </>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cortos.length ? (
          <p className="rx-note rx-cmp-cortos">
            {t('cmp.cortos')}{' '}
            {cortos.map((f, i) => (
              <Fragment key={f.intento}>{i ? '; ' : ''}{t('cmp.corto', { i: f.intento, s: s(f.duracion), m: muertes(f.muertes), h: hab(f.ultimaCausa) })}</Fragment>
            ))}
          </p>
        ) : null}
      </article>

      <article className="rx-card">
        <h3>{t('cmp.tabla.t')}</h3>
        <p className="rx-note">{t('cmp.tabla.nota', { i: ref.intento })}</p>
        <div className="rx-table-wrap">
          <table className="rx-table rx-cmp-hitos">
            <thead>
              <tr><th>{t('cmp.th.intento')}</th>{c.hitos.map((h) => <th key={h}>{t('cmp.pct', { n: h })}</th>)}</tr>
            </thead>
            <tbody>
              {c.tabla.map((fila) => (
                <tr key={fila.intento} className={fila.intento === ref.intento ? 'rx-cmp-ref' : undefined}>
                  <td>{fila.intento === ref.intento ? t('cmp.ref', { i: fila.intento }) : fila.intento}</td>
                  {fila.celdas.map((x, k) => (
                    <td key={c.hitos[k]}>
                      {x ? (
                        <>
                          <span className={x.lento ? 'rx-bad' : undefined}>{s(x.s)}</span>{' '}
                          <small className={x.muchas ? 'rx-bad' : undefined}>{t('cmp.celdaMuertes', { m: x.muertes })}</small>
                        </>
                      ) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {repetidos.length ? (
        <article className="rx-card">
          <h3>{t('cmp.jug.t')}</h3>
          <Explicacion t={t} corto={t('cmp.jug.corto', { i: refNombre })} metodo={t('cmp.jug.nota', { i: refNombre })} />
          <div className="rx-table-wrap">
            <table className="rx-table rx-cmp-jug">
              <thead><tr><th>{t('th.player')}</th><th>{t('cmp.th.veces')}</th><th>{t('cmp.th.cuales')}</th></tr></thead>
              <tbody>
                {repetidos.map((j) => (
                  <tr key={j.jugador}>
                    <td>{j.jugador}</td>
                    <td>{t('cmp.veces', { n: j.intentos.length, de: c.cuentas.comparables })}</td>
                    <td>{j.intentos.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}
