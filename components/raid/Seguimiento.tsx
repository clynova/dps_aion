// «Desde la raid anterior» de la página de una raid: qué cambió respecto a la raid anterior del mismo jefe y qué pasó
// con las recomendaciones de aquel análisis (lib/raids/seguimiento.ts). Sale del servidor ya calculado y traducido.
import { localeDe, rutaEn, type Idioma, type Traductor } from '@/lib/i18n';
import { seguir, type AnalisisSeg, type AtaqueSeg, type Medida, type RaidSeg, type Veredicto } from '@/lib/raids/seguimiento';

type NombresHab = { apodos: Record<string, string>; habilidades: Record<string, string>; npcs: Record<string, string> };
type Props = {
  t: Traductor; idioma: Idioma; grupo: string; nombres: NombresHab;
  /** El data.json de esta raid y el de la anterior, con el análisis de la anterior */
  datos: unknown; anterior: { slug: string; datos: unknown; analisis: unknown };
};

const SIGNO: Record<Veredicto, string> = { mejor: '▲', igual: '=', peor: '▼' };

export default function Seguimiento({ t, idioma, grupo, nombres, datos, anterior }: Props) {
  const s = seguir(datos as RaidSeg, anterior.datos as RaidSeg, anterior.analisis as AnalisisSeg);
  const locale = localeDe(idioma);
  const n2 = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const n1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const n0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  // La fecha, del texto ISO (hora local de quien grabó): sin pasar por la zona horaria del servidor
  const f = s.anterior.fecha;
  const fecha = `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${f.slice(0, 10)}T12:00:00Z`))}, ${f.slice(11, 16)}`;

  const nombre = (id: string) => nombres.apodos[id] || nombres.habilidades[id] || nombres.npcs[id];
  /** El título de una recomendación como lo pinta la página: ids por «nombre» y sin las marcas de negrita */
  const texto = (x: string) => x.replace(/\*\*/g, '').replace(/\b\d{6,8}\b/g, (id) => (nombre(id) ? t('q.open') + nombre(id) + t('q.close') : id));
  const num = (x: number | null, nf: Intl.NumberFormat) => (x === null ? '—' : nf.format(x));
  const veredicto = (v: Veredicto | null) => (
    <span className={`rx-pill${v === 'mejor' ? ' is-ok' : v === 'peor' ? ' is-bad' : ''}`}>
      {v ? <span aria-hidden="true">{SIGNO[v]}</span> : null}{t(v ? `seg.v.${v}` : 'seg.v.nulo')}
    </span>
  );
  /** «antes → ahora» con la flecha del resultado (y su nombre para quien no ve el color) */
  const cambio = (m: Medida, nf: Intl.NumberFormat) => {
    if (m.antes === null && m.ahora === null) return '—';
    const v = m.veredicto;
    return (
      <span className={v === 'mejor' ? 'rx-seg-ok' : v === 'peor' ? 'rx-bad' : undefined} title={v ? t(`seg.v.${v}`) : undefined}>
        {t('seg.cambio', { a: num(m.antes, nf), b: num(m.ahora, nf) })}{v && v !== 'igual' ? <span aria-hidden="true"> {SIGNO[v]}</span> : null}
      </span>
    );
  };
  const ataque = (a: AtaqueSeg) => {
    const partes = !a.vistoAntes ? [t('seg.ataque.noAntes')] : !a.vistoAhora ? [t('seg.ataque.noAhora')] : [
      t('seg.ataque.muertes', { a: num(a.muertes.antes, n2), b: num(a.muertes.ahora, n2) }),
      ...(a.tasa.antes !== null && a.tasa.ahora !== null ? [t('seg.ataque.tasa', { a: n1.format(a.tasa.antes), b: n1.format(a.tasa.ahora) })] : []),
    ];
    const v = a.muertes.veredicto === 'igual' && a.tasa.veredicto ? a.tasa.veredicto : a.muertes.veredicto;
    return (
      <li key={a.habilidad}>
        <b>{nombre(a.habilidad) || a.habilidad}</b>: {partes.join(' · ')}
        {v && v !== 'igual' ? <span className={v === 'mejor' ? 'rx-seg-ok' : 'rx-bad'} title={t(`seg.v.${v}`)}> {SIGNO[v]}</span> : null}
      </li>
    );
  };
  const mejor = (pct: number | null, matado: boolean) => (matado ? t('seg.matado') : pct === null ? '—' : t('seg.pct', { n: n1.format(pct) }));

  return (
    <section className="rx-section" id="seguimiento">
      <h2 className="rx-h2">{t('seg.titulo')}</h2>
      <p className="rx-note">
        {t('seg.nota', { m: s.actual.intentos, n: s.anterior.intentos })}{' '}
        <a className="rx-link" href={rutaEn(idioma, `/g/${grupo}/raids/${anterior.slug}`)}>{t('seg.enlace', { fecha })}</a>
      </p>

      <article className="rx-card">
        <h3>{t('seg.grupo.t')}</h3>
        <div className="rx-table-wrap">
          <table className="rx-table rx-seg">
            <thead><tr><th>{t('seg.th.medida')}</th><th>{t('seg.th.antes')}</th><th>{t('seg.th.ahora')}</th><th>{t('seg.th.resultado')}</th></tr></thead>
            <tbody>
              <tr><td>{t('seg.m.muertes')}</td><td>{num(s.grupo.muertes.antes, n2)}</td><td>{num(s.grupo.muertes.ahora, n2)}</td><td>{veredicto(s.grupo.muertes.veredicto)}</td></tr>
              <tr><td>{t('seg.m.mejor')}</td><td>{mejor(s.grupo.mejor_pct.antes, s.anterior.matado)}</td><td>{mejor(s.grupo.mejor_pct.ahora, s.actual.matado)}</td><td>{veredicto(s.grupo.mejor_pct.veredicto)}</td></tr>
              <tr><td>{t('seg.m.dps')}</td><td>{num(s.grupo.dps.antes, n0)}</td><td>{num(s.grupo.dps.ahora, n0)}</td><td>{veredicto(s.grupo.dps.veredicto)}</td></tr>
            </tbody>
          </table>
        </div>
      </article>

      <article className="rx-card">
        <h3>{t('seg.recos.t')}</h3>
        {s.recomendaciones.length ? (
          <>
            <p className="rx-note">{t('seg.recos.nota')}{s.conTasas ? '' : ` ${t('seg.sinTasas')}`}</p>
            <div className="rx-table-wrap">
              <table className="rx-table rx-seg-recos">
                <thead><tr><th>{t('seg.th.reco')}</th><th>{t('seg.th.ataques')}</th><th>{t('seg.th.resultado')}</th></tr></thead>
                <tbody>
                  {s.recomendaciones.map((r, i) => (
                    <tr key={i}>
                      <td>{texto(r.titulo)}</td>
                      <td>{r.ataques.length ? <ul className="rx-seg-lista">{r.ataques.map(ataque)}</ul> : <span className="rx-note">{t('seg.sinAtaques')}</span>}</td>
                      <td>{veredicto(r.veredicto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="rx-note">{t('seg.recos.vacio')}</p>}
      </article>

      {s.jugadores.length ? (
        <article className="rx-card">
          <h3>{t('seg.jug.t')}</h3>
          <p className="rx-note">{t('seg.jug.nota')}</p>
          <div className="rx-table-wrap">
            <table className="rx-table rx-seg-jug">
              <thead><tr><th>{t('th.player')}</th><th>{t('seg.th.muertes')}</th><th>{t('th.dps')}</th><th>{t('seg.th.consejos')}</th></tr></thead>
              <tbody>
                {s.jugadores.map((j) => (
                  <tr key={j.jugador}>
                    <td>{j.jugador}</td>
                    <td>{cambio(j.muertes, n2)}</td>
                    <td>{cambio(j.dps, n0)}</td>
                    <td>{j.ataques.length ? <ul className="rx-seg-lista">{j.ataques.map(ataque)}</ul> : null}</td>
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
