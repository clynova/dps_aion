// «Especializaciones y buffs» de la página de una raid: las especializaciones de cada jugador frente a las de los demás
// de su clase (lib/raids/especializaciones.ts) y qué parte de su tiempo vivo tuvo cada buff de sus compañeros
// (lib/raids/buffs.ts). Sale del servidor ya calculado y traducido. Las raids extraídas antes del 10/11/2026 no traen
// estos datos y muestran un aviso.
import TablaEspecializaciones from '@/components/raid/TablaEspecializaciones';
import { localeDe, type Clave, type Idioma, type Traductor } from '@/lib/i18n';
import { analizarBuffs, type BuffDato } from '@/lib/raids/buffs';
import { analizarEspecializaciones, formatoOpciones, type EspecializacionDato } from '@/lib/raids/especializaciones';
import Explicacion from '@/components/ui/Explicacion';

type Datos = { meta: unknown; jugadores?: { jugador: string; clase_id: string | null }[]; especializaciones?: EspecializacionDato[]; buffs_recibidos?: BuffDato[] };
type NombresHab = { apodos: Record<string, string>; habilidades: Record<string, string> };

export default function Builds({ t, idioma, datos, nombres }: { t: Traductor; idioma: Idioma; datos: Datos; nombres: NombresHab }) {
  const titulo = <h2 className="rx-h2">{t('bx.titulo')}</h2>;
  if (!datos.especializaciones && !datos.buffs_recibidos) return <section className="rx-section" id="builds">{titulo}<p className="rx-pending">{t('bx.sinDatos')}</p></section>;
  const grupo = (datos.meta as { grupo: string[] }).grupo;
  const tablas = analizarEspecializaciones(datos.especializaciones ?? [], datos.jugadores ?? [], grupo);
  const varios = tablas.filter((x) => x.jugadores.length >= 2), solos = tablas.filter((x) => x.jugadores.length < 2);
  const b = analizarBuffs(datos.buffs_recibidos ?? [], grupo);
  const nf = new Intl.NumberFormat(localeDe(idioma), { maximumFractionDigits: 1 });
  const pct = (x: number) => t('cmp.pct', { n: nf.format(x) });
  const nombreHab = (id: string) => nombres.apodos[id] || nombres.habilidades[id] || id;
  const clase = (c: string) => t(`class.${c}` as Clave);

  return (
    <section className="rx-section" id="builds">
      {titulo}
      {tablas.length ? (
        <article className="rx-card">
          <h3>{t('bx.esp.t')}</h3>
          <Explicacion t={t} corto={t('bx.esp.corto')} metodo={t('bx.esp.nota')} />
          <div className="bx-clases">
            {varios.map((x) => (
              <div key={x.clase} className="bx-clase">
                <h4>{clase(x.clase)} <span className="rx-note">{x.distintas ? t('bx.esp.distintas', { n: x.distintas }) : t('bx.esp.iguales')}</span></h4>
                <TablaEspecializaciones t={t} tabla={x} nombreHab={nombreHab} />
              </div>
            ))}
          </div>
          {solos.length ? (
            <details className="bx-solos">
              <summary>{t('bx.esp.solos', { n: solos.length })}</summary>
              {solos.map((x) => (
                <p key={x.clase} className="rx-note">
                  <b>{x.jugadores[0]}</b> ({clase(x.clase)}): {x.filas.map((f) => `${nombreHab(f.habilidad)} ${formatoOpciones(f.opciones[0]!)}`).join(' · ')}
                </p>
              ))}
            </details>
          ) : null}
        </article>
      ) : null}

      {b.buffs.length ? (
        <article className="rx-card">
          <h3>{t('bx.buf.t')}</h3>
          <Explicacion t={t} corto={t('bx.buf.corto')} metodo={t('bx.buf.nota')} />
          {b.bajos.length ? (
            <ul className="bx-bajos">
              {b.bajos.map((x) => (
                <li key={`${x.jugador}-${x.lanzador}-${x.habilidad}`}>
                  {t('bx.buf.bajo', { j: x.jugador, h: t('q.open') + nombreHab(x.habilidad) + t('q.close'), l: x.lanzador, p: pct(x.pct), m: pct(x.mediana) })}
                </li>
              ))}
            </ul>
          ) : <p className="rx-note">{t('bx.buf.ninguno')}</p>}
          <details className="bx-todos">
            <summary>{t('bx.buf.todos', { n: b.buffs.length })}</summary>
            <div className="rx-table-wrap">
              <table className="rx-table bx-buf">
                <thead><tr><th>{t('bx.th.buff')}</th><th>{t('bx.th.lanzador')}</th><th>{t('bx.th.receptores')}</th></tr></thead>
                <tbody>
                  {b.buffs.map((g) => (
                    <tr key={`${g.lanzador}-${g.habilidad}`}>
                      <td>{nombreHab(g.habilidad)}</td>
                      <td>{g.lanzador}</td>
                      <td>{g.receptores.map((r, k) => (
                        <span key={r.jugador} className={r.bajo ? 'rx-bad' : undefined}>{k ? ' · ' : ''}{r.jugador} {pct(r.pct)}</span>
                      ))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </article>
      ) : null}
    </section>
  );
}
