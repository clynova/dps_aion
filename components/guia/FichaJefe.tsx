// Ficha de un jefe del módulo «Raids» (contenido/raids/<raid>/<npc>.<idioma>.json): fases, mecánicas (las que hacen
// wipe primero), consejos por rol y notas. Estática: sale del servidor sin leer la base.
import type { FichaJefe as Ficha } from '@/lib/guia/esquema';
import { ROLES } from '@/lib/guia/esquema';
import { nombreAtaque } from '@/lib/guia/contenido';
import type { Clave, Idioma, Traductor } from '@/lib/i18n';
import { Afirmaciones, Origen } from './Piezas';

export default function FichaJefe({ t, idioma, ficha }: { t: Traductor; idioma: Idioma; ficha: Ficha }) {
  const mecanicas = [...ficha.mecanicas].sort((a, b) => Number(b.wipe) - Number(a.wipe));
  const roles = ROLES.filter((r) => ficha.consejos[r]?.length);
  return (
    <>
      {ficha.fases.length ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('guias.fases')}</h2>
          <p className="rx-note">{t('guias.fases.nota')}</p>
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

      {mecanicas.length ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('guias.mecanicas')}</h2>
          <p className="rx-note">{t('guias.mecanicas.nota')}</p>
          <div className="rx-grid">
            {mecanicas.map((m) => {
              const nombres = [...new Set(m.ataques.map((a) => nombreAtaque(a, idioma)))];
              return (
                <article key={m.id} id={m.id} className={`rx-card gx-mecanica${m.wipe ? ' is-wipe' : ''}`}>
                  <h3>{m.titulo}</h3>
                  <p className="gx-chips">
                    {m.wipe ? <span className="rx-pill is-bad">{t('guias.wipe')}</span> : null}
                    <span className={`rx-pill gx-endatos is-${m.en_datos}`}>{t(`guias.endatos.${m.en_datos}` as Clave)}</span>
                    {m.roles.filter((r) => r !== 'todos').map((r) => <span key={r} className="rx-pill">{t(`guias.rol.${r}` as Clave)}</span>)}
                  </p>
                  <p className="cx-texto">{m.texto}</p>
                  <p className="cx-texto gx-como"><strong>{t('guias.como')}:</strong> {m.como}</p>
                  {nombres.length ? <p className="hm-sub"><span>{t('guias.ataques')}:</span>{nombres.map((n) => <span key={n}>{t('q.open')}{n}{t('q.close')}</span>)}</p> : null}
                  <Origen t={t} origen={m.origen} fuentes={m.fuentes} />
                </article>
              );
            })}
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

      {ficha.notas.length ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('guias.notas')}</h2>
          <dl className="rx-card gx-notas">
            {ficha.notas.map((n) => <div key={n.termino}><dt>{n.termino}</dt><dd>{n.texto}</dd></div>)}
          </dl>
        </section>
      ) : null}
    </>
  );
}
