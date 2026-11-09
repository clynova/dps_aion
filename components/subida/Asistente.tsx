'use client';
// Asistente de subida (/g/[grupo]/subir): carpeta de Questlog → elegir la run → calcular en el navegador (DuckDB-WASM,
// lib/procesado) → revisar y elegir visibilidad → POST /api/v1/grupos/:grupo/raids. Una sola run a la vez.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { localeDe, rutaEn, traductor, type Idioma } from '@/lib/i18n';
import { VISIBILIDADES, type Visibilidad } from '@/lib/permisos';
import type { Procesada, Procesador, RunListada } from '@/lib/procesado/procesar';

type Props = {
  idioma: Idioma; grupo: string; visibilidadDefecto: Visibilidad;
  npcsEs: Record<string, string>; npcs: Record<string, string>; yaSubidas: string[];
};
type Estado =
  | { fase: 'motor' } | { fase: 'errorMotor' } | { fase: 'carpeta'; error?: string } | { fase: 'leyendo' }
  | { fase: 'lista'; runs: RunListada[]; error?: string }
  | { fase: 'procesando'; runs: RunListada[]; run: RunListada; paso: string }
  | { fase: 'revision'; runs: RunListada[]; run: RunListada; p: Procesada; enviando?: boolean; error?: string; duplicada?: string }
  | { fase: 'hecho'; runs: RunListada[]; slug: string; nueva: boolean };

export default function Asistente({ idioma, grupo, visibilidadDefecto, npcsEs, npcs, yaSubidas }: Props) {
  const t = useMemo(() => traductor(idioma), [idioma]);
  const loc = localeDe(idioma);
  const [estado, setEstado] = useState<Estado>({ fase: 'motor' });
  const [vis, setVis] = useState<Visibilidad>(visibilidadDefecto);
  const proc = useRef<Procesador | null>(null);
  const [subidas, setSubidas] = useState(() => new Set(yaSubidas));

  useEffect(() => {
    let vivo = true;
    import('@/lib/procesado/procesar').then(({ Procesador }) => Procesador.crear())
      .then((p) => { if (vivo) { proc.current = p; setEstado({ fase: 'carpeta' }); } })
      .catch(() => { if (vivo) setEstado({ fase: 'errorMotor' }); });
    return () => { vivo = false; };
  }, []);

  const fecha = (ms: number) => new Date(ms).toLocaleString(loc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const nombreJefe = (npc: number | null) => (npc ? npcs[String(npc)] ?? npcsEs[String(npc)] ?? `#${npc}` : t('subir.run.sinJefe'));

  async function alElegirCarpeta(files: FileList | null) {
    if (!files?.length || !proc.current) return;
    setEstado({ fase: 'leyendo' });
    const { mapaQuestlog } = await import('@/lib/procesado/procesar');
    try { setEstado({ fase: 'lista', runs: await proc.current.cargarCarpeta(mapaQuestlog(Array.from(files))) }); }
    catch { setEstado({ fase: 'carpeta', error: t('subir.errorCarpeta') }); }
  }

  async function calcular(runs: RunListada[], run: RunListada) {
    if (!proc.current) return;
    setEstado({ fase: 'procesando', runs, run, paso: '' });
    try {
      const p = await proc.current.procesarRun(run, npcsEs, (paso) => setEstado({ fase: 'procesando', runs, run, paso }));
      setEstado({ fase: 'revision', runs, run, p });
    } catch { setEstado({ fase: 'lista', runs, error: t('subir.errorProcesar') }); }
  }

  async function subir(e: Extract<Estado, { fase: 'revision' }>, reemplazar = false) {
    setEstado({ ...e, enviando: true, error: undefined, duplicada: undefined });
    const qs = new URLSearchParams({ visibilidad: vis, ...(reemplazar ? { reemplazar: '1' } : {}) });
    let r: Response;
    try { r = await fetch(`/api/v1/grupos/${encodeURIComponent(grupo)}/raids?${qs}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e.p.json) }); }
    catch { setEstado({ ...e, enviando: false, error: t('subir.errorRed') }); return; }
    const cuerpo = await r.json().catch(() => ({})) as { slug?: string; nueva?: boolean; existente?: string; problemas?: string[]; error?: string; limite?: number; libre?: string | null };
    if (r.ok) { setSubidas((s) => new Set(s).add(e.run.id)); setEstado({ fase: 'hecho', runs: e.runs, slug: cuerpo.slug ?? e.p.slug, nueva: !!cuerpo.nueva }); return; }
    if (r.status === 409) { setEstado({ ...e, enviando: false, duplicada: cuerpo.existente }); return; }
    if (r.status === 429 && cuerpo.error === 'limite-raids') {
      const d = cuerpo.libre ? new Date(cuerpo.libre).toLocaleDateString(localeDe(idioma), { day: 'numeric', month: 'long' }) : '—';
      setEstado({ ...e, enviando: false, error: t('subir.errorLimite', { n: cuerpo.limite ?? 0, d }) }); return;
    }
    if (r.status === 401) { setEstado({ ...e, enviando: false, error: t('subir.errorSesion') }); return; }
    if (r.status === 422) { setEstado({ ...e, enviando: false, error: t('subir.errorFormato', { detalle: (cuerpo.problemas ?? []).slice(0, 3).join(' · ') }) }); return; }
    setEstado({ ...e, enviando: false, error: t('comun.error') });
  }

  const pasoTexto = (paso: string) => paso.startsWith('descomprimir:') ? t('subir.paso.descomprimir', { i: paso.split(':')[1] })
    : paso === 'cargar' ? t('subir.paso.cargar') : paso === 'calcular' ? t('subir.paso.calcular') : t('subir.procesando');

  if (estado.fase === 'motor') return <p className="rx-note" role="status">{t('subir.cargandoMotor')}</p>;
  if (estado.fase === 'errorMotor') return <p className="cx-error" role="alert">{t('subir.errorMotor')}</p>;

  const lista = 'runs' in estado ? estado.runs : null;
  return (
    <>
      <section className="rx-section">
        <h2 className="rx-h2">{t('subir.paso1')}</h2>
        <p className="rx-note">{t('subir.paso1.ayuda')}</p>
        <div>
          <label className="cx-boton cx-boton-sec" style={{ display: 'inline-block' }}>
            {t('subir.elegir')}
            <input type="file" multiple hidden data-carpeta
              // @ts-expect-error -- atributo no estándar (Chrome, Edge y Firefox lo admiten) para elegir una carpeta
              webkitdirectory="" directory=""
              onChange={(ev) => alElegirCarpeta(ev.target.files)} />
          </label>
        </div>
        {estado.fase === 'leyendo' ? <p className="rx-note" role="status">{t('subir.leyendo')}</p> : null}
        {estado.fase === 'carpeta' && estado.error ? <p className="cx-error" role="alert">{estado.error}</p> : null}
      </section>

      {lista ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('subir.paso2')}</h2>
          <p className="rx-note">{t('subir.paso2.nota')}</p>
          {estado.fase === 'lista' && estado.error ? <p className="cx-error" role="alert">{estado.error}</p> : null}
          <ul className="cx-lista rx-card">
            {lista.filter((r) => r.encuentros > 0).slice(0, 30).map((r) => {
              const elegida = 'run' in estado && estado.run.id === r.id;
              const ocupado = estado.fase === 'procesando' || (estado.fase === 'revision' && !!estado.enviando);
              return (
                <li key={r.id} data-run={r.id} style={elegida ? { background: 'color-mix(in srgb, var(--series-1) 8%, transparent)' } : undefined}>
                  <span className="cx-crece">
                    <span><b>{nombreJefe(r.jefe)}</b>{' '}
                      {r.jugadores >= 8 ? <span className="rx-pill is-ok">{t('subir.run.raid')}</span> : null}{' '}
                      {subidas.has(r.id) ? <span className="rx-pill">{t('subir.run.subida')}</span> : null}
                    </span>
                    <span className="rx-note">
                      {fecha(r.entrada)} · {r.intentosJefe === 1 ? t('subir.run.intentos1') : t('subir.run.intentosN', { n: r.intentosJefe })} · {t('subir.run.jugadores', { n: r.jugadores })}
                    </span>
                  </span>
                  <button type="button" className="cx-boton" disabled={!r.jefe || ocupado} onClick={() => calcular(lista, r)}>
                    {estado.fase === 'procesando' && elegida ? pasoTexto(estado.paso) : t('subir.procesar')}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {estado.fase === 'revision' ? <Revision e={estado} t={t} idioma={idioma} nombreJefe={nombreJefe} vis={vis} setVis={setVis} subir={subir} cancelar={() => setEstado({ fase: 'lista', runs: estado.runs })} /> : null}

      {estado.fase === 'hecho' ? (
        <section className="rx-section" role="status">
          <p className="cx-ok">{estado.nueva ? t('subir.hecho.nueva') : t('subir.hecho.actualizada')}</p>
          <p className="cx-fila">
            <Link className="cx-boton" href={rutaEn(idioma, `/g/${grupo}/raids/${estado.slug}`)}>{t('subir.ver')}</Link>
            <button type="button" className="cx-boton cx-boton-sec" onClick={() => setEstado({ fase: 'lista', runs: estado.runs })}>{t('subir.otra')}</button>
          </p>
        </section>
      ) : null}
    </>
  );
}

type Datos = { meta: { npc: number; fecha: string }; resumen: { intentos: number; matado: boolean; mejor_pct: number; muertes_grupo: number; dps_grupo_medio: number };
  jugadores: { jugador: string; clase_id: string; dps: number; muertes: number }[] };

function Revision({ e, t, idioma, nombreJefe, vis, setVis, subir, cancelar }: {
  e: Extract<Estado, { fase: 'revision' }>; t: ReturnType<typeof traductor>; idioma: Idioma; nombreJefe: (n: number) => string;
  vis: Visibilidad; setVis: (v: Visibilidad) => void; subir: (e: Extract<Estado, { fase: 'revision' }>, reemplazar?: boolean) => void; cancelar: () => void;
}) {
  const d = e.p.json as unknown as Datos;
  const loc = localeDe(idioma);
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  const pct = new Intl.NumberFormat(loc, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(d.resumen.mejor_pct) + (idioma === 'es' ? ' %' : '%');
  return (
    <section className="rx-section" aria-live="polite">
      <h2 className="rx-h2">{t('subir.paso3')}</h2>
      <article className="rx-card">
        <h3>{t('subir.resumen', { jefe: nombreJefe(d.meta.npc), fecha: new Date(d.meta.fecha).toLocaleString(loc, { dateStyle: 'long', timeStyle: 'short' }) })}</h3>
        <p className="rx-note">
          {d.resumen.matado ? t('subir.resultado.kill') : t('subir.resultado.mejor', { p: pct })} · {d.resumen.intentos === 1 ? t('subir.run.intentos1') : t('subir.run.intentosN', { n: d.resumen.intentos })} · {t('tile.deaths')}: {nf.format(d.resumen.muertes_grupo)} · {t('subir.calculado', { s: new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(e.p.segundos) })}
        </p>
        <h4 className="rx-h2" style={{ fontSize: 'var(--fs-body)' }}>{t('subir.jugadores')}</h4>
        <ul className="cx-lista">
          {d.jugadores.map((j) => (
            <li key={j.jugador}><span className="cx-crece"><b>{j.jugador}</b><span className="rx-note">{t(`class.${j.clase_id}` as never)} · {nf.format(j.dps)} DPS · {t('th.deaths')}: {nf.format(j.muertes)}</span></span></li>
          ))}
        </ul>
      </article>
      <p className="rx-note">{t('subir.privacidad')}</p>
      <div className="cx-campo">
        <label htmlFor="s-vis">{t('subir.visibilidad')}</label>
        <select id="s-vis" className="cx-select" value={vis} onChange={(ev) => setVis(ev.target.value as Visibilidad)} disabled={e.enviando}>
          {VISIBILIDADES.map((v) => <option key={v} value={v}>{t(`vis.${v}`)}</option>)}
        </select>
      </div>
      {e.duplicada ? (
        <div className="rx-pending" role="alert">
          <p>{t('subir.duplicada', { slug: e.duplicada })}</p>
          <p className="cx-fila">
            <button type="button" className="cx-boton cx-boton-peligro" onClick={() => subir(e, true)}>{t('subir.reemplazar')}</button>
            <button type="button" className="cx-boton cx-boton-sec" onClick={cancelar}>{t('subir.cancelar')}</button>
          </p>
        </div>
      ) : (
        <p className="cx-fila">
          <button type="button" className="cx-boton" onClick={() => subir(e)} disabled={e.enviando}>{e.enviando ? t('subir.subiendo') : t('subir.boton')}</button>
          <button type="button" className="cx-boton cx-boton-sec" onClick={cancelar} disabled={e.enviando}>{t('subir.cancelar')}</button>
        </p>
      )}
      {e.error ? <p className="cx-error" role="alert">{e.error}</p> : null}
    </section>
  );
}
