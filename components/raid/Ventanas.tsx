// «Ventanas de daño» de la página de una raid: el daño de cada jugador mientras la barra del jefe está rota frente al
// resto del combate, y los debuffs que mantiene sobre el jefe (lib/raids/ventanas.ts). Sale del servidor ya calculado
// y traducido; no necesita JavaScript. Las raids extraídas antes del 9/11/2026 no traen «ventanas» y muestran un aviso.
import { localeDe, type Idioma, type Traductor } from '@/lib/i18n';
import { analizarVentanas, type VentanasDato } from '@/lib/raids/ventanas';
import Explicacion from '@/components/ui/Explicacion';
import NombreJugador from '@/components/raid/NombreJugador';

type Datos = { meta: unknown; ventanas?: VentanasDato };
type NombresHab = { apodos: Record<string, string>; habilidades: Record<string, string> };

export default function Ventanas({ t, idioma, datos, nombres }: { t: Traductor; idioma: Idioma; datos: Datos; nombres: NombresHab }) {
  const titulo = <h2 className="rx-h2">{t('ven.titulo')}</h2>;
  if (!datos.ventanas) return <section className="rx-section" id="ventanas">{titulo}<p className="rx-pending">{t('ven.sinDatos')}</p></section>;
  const a = analizarVentanas(datos.ventanas, (datos.meta as { grupo: string[] }).grupo);
  if (!a.roturas && !a.debuffs.length) return null;
  const loc = localeDe(idioma);
  const compacto = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const n2 = new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hab = (id: string) => nombres.apodos[id] || nombres.habilidades[id] || id;
  const dps = (x: number | null) => (x === null ? '—' : compacto.format(x));
  const mult = (x: number | null) => (x === null ? '—' : t('ven.mult', { n: n2.format(x) }));
  const pct = (x: number | null) => (x === null ? '—' : t('ven.pct', { n: nf.format(x) }));

  // Debuffs: los 3 que más mantiene cada jugador, con barras; la lista entera, plegada
  const totalDebuffs = a.debuffs.reduce((s, d) => s + d.lista.length, 0);
  const recortados = a.debuffs.some((d) => d.lista.length > 3);
  const barra = (x: number | null) => (
    <span className="rx-mini-v"><span className="rx-mini" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, x ?? 0))}%` }} /></span>{pct(x)}</span>
  );
  const tablaDebuffs = (max: number) => (
    <div className="rx-table-wrap">
      <table className="rx-table rx-ven-deb">
        <thead>
          <tr><th>{t('th.player')}</th><th>{t('ven.th.debuff')}</th><th>{t('ven.th.activo')}</th><th>{t('ven.th.enRotura')}</th></tr>
        </thead>
        <tbody>
          {a.debuffs.flatMap((d) => d.lista.slice(0, max).map((x, i) => (
            <tr key={`${d.jugador}-${x.habilidad}`} className={i === 0 ? 'rx-ven-primero' : undefined}>
              <td>{i === 0 ? <NombreJugador n={d.jugador} /> : ''}</td>
              <td>{hab(x.habilidad)}</td>
              <td>{barra(x.activo_pct)}</td>
              <td>{barra(x.rotura_pct)}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="rx-section" id="ventanas">
      {titulo}
      <article className="rx-card">
        <h3>{t('ven.rot.t')}</h3>
        {a.roturas ? (
          <>
            <Explicacion t={t} corto={t('ven.rot.corto', { n: a.roturas, i: a.intentos, s: nf.format(a.segundos) })} metodo={t('ven.rot.nota', { n: a.roturas, i: a.intentos, s: nf.format(a.segundos) })} />
            <div className="rx-table-wrap">
              <table className="rx-table rx-ven">
                <thead>
                  <tr>
                    <th>{t('th.player')}</th><th>{t('ven.th.vivo')}</th><th>{t('ven.th.dpsRotura')}</th><th>{t('ven.th.dpsFuera')}</th>
                    <th>{t('ven.th.mult')}</th><th>{t('ven.th.pct')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="rx-rep-total">
                    <td>{t('ven.grupo')}</td><td></td><td>{dps(a.grupo.dpsRotura)}</td><td>{dps(a.grupo.dpsFuera)}</td><td>{mult(a.grupo.mult)}</td><td></td>
                  </tr>
                  {a.jugadores.map((j) => (
                    <tr key={j.jugador}>
                      <td><NombreJugador n={j.jugador} /></td>
                      <td className={j.presentes < j.roturas ? 'rx-ven-falta' : undefined}>{t('ven.vivo', { n: j.presentes, de: j.roturas })}</td>
                      <td>{dps(j.dpsRotura)}</td>
                      <td>{dps(j.dpsFuera)}</td>
                      <td>{j.nivel === 'alto' ? <span aria-hidden="true">▲ </span> : j.nivel === 'bajo' ? <span aria-hidden="true">▽ </span> : null}{mult(j.mult)}</td>
                      <td>{pct(j.pctEnRotura)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="rx-note">{t('ven.rot.ninguna')}</p>}
      </article>

      {a.debuffs.length ? (
        <article className="rx-card">
          <h3>{t('ven.deb.t')}</h3>
          <Explicacion t={t} corto={t('ven.deb.corto')} metodo={t('ven.deb.nota')} />
          {recortados ? <p className="rx-note">{t('ven.deb.top')}</p> : null}
          {tablaDebuffs(3)}
          {recortados ? (
            <details className="rx-details">
              <summary>{t('ven.deb.todos', { n: totalDebuffs })}</summary>
              {tablaDebuffs(Infinity)}
            </details>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
