'use client';
// Simulador de la Prueba de Ludra, el «bingo» (pestaña «Simulador» de la ficha de Ludra en la guía). El motor es
// lib/simulador/ludra.ts; el plan por fases, docs/plan-simulador-ludra.md. Tres modos: Planificar (colocar jugadores
// y sus caminos, con la tanda que destapa cada casilla), Simular (reproducir un caso con la segura al azar) y
// Probar las 36 (el plan contra cada casilla segura). Los textos (claves sim.*) llegan del servidor en el idioma de la
// página. El plan y los ajustes se recuerdan en este navegador (localStorage), sin base de datos.
import { useEffect, useMemo, useRef, useState, type PointerEvent as EventoPuntero } from 'react';
import {
  azar, centro, cobertura, DT, escenarioAlAzar, opuesta, PELIGROS, PRESETS, probarTodas, problemasDelPlan, puntoEsquina, simular,
  type Causa, type Celda, type Esquina, type JugadorPlan, type Parada, type Plan,
} from '@/lib/simulador/ludra';
import { ajustesDe, configDe, PLAN_EJEMPLO, type Ajustes, type Prueba } from '@/lib/simulador/ajustes';
import { codificarPlan, leerEnlace } from '@/lib/simulador/enlace';
import { aplicarPlantilla, PLANTILLAS, type NombrePlantilla } from '@/lib/simulador/plantillas';
import type { Conocido } from '@/lib/simulador/captura';
import LectorCaptura from './LectorCaptura';

type Modo = 'editar' | 'simular' | 'probar';

const N = 6;           // casillas por lado (el motor admite otros tamaños; la pestaña usa el del juego)
const S = 56;          // px por casilla en el SVG
const M = 64;          // margen alrededor del tablero (orbes, esquinas, Ludra)
const COLORES = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#2bb5d6', '#f032e6', '#9bbf1f', '#e58fa8', '#469990', '#a98be0', '#9a6324'];
const LETRAS = 'ABCDEFGHIJ';
const MODOS: Modo[] = ['editar', 'simular', 'probar'];
const CLAVE_LOCAL = 'dps-aion:simulador-ludra';

export const nombreCelda = (c: Celda) => `${LETRAS[c.k]}${c.f + 1}`;
const iguales = (a: Celda, b: Celda) => a.f === b.f && a.k === b.k;
const px = (x: number) => x * S;

/** Lo guardado en este navegador, si sigue siendo válido */
function leerLocal(): { plan: Plan; ajustes: Ajustes } | null {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_LOCAL) ?? 'null') as { plan: Plan; ajustes: Ajustes } | null;
    if (!d?.plan?.jugadores || !d.ajustes || !(d.ajustes.prueba in PRESETS)) return null;
    if (problemasDelPlan(PRESETS.prueba1, { jugadores: d.plan.jugadores.filter((j) => j.ruta.length) }).length) return null;
    const m = d.plan.marcas, enTablero = (c: Celda) => Number.isInteger(c?.f) && Number.isInteger(c?.k) && c.f >= 0 && c.k >= 0 && c.f < N && c.k < N;
    if (m !== undefined && !(Array.isArray(m) && m.length <= 4 && m.every(enTablero))) return { ...d, plan: { jugadores: d.plan.jugadores } };
    return d;
  } catch { return null; }
}

/** Posiciones en px con un pequeño desplazamiento para los que coinciden en el mismo punto */
function separar(puntos: { x: number; y: number }[]): { x: number; y: number }[] {
  const grupos = new Map<string, number[]>();
  puntos.forEach((p, i) => { const k = `${p.x.toFixed(2)},${p.y.toFixed(2)}`; grupos.set(k, [...(grupos.get(k) ?? []), i]); });
  const r = puntos.map((p) => ({ x: px(p.x), y: px(p.y) }));
  for (const ids of grupos.values()) {
    if (ids.length < 2) continue;
    const radio = Math.min(24, 6 + 2 * ids.length);
    ids.forEach((i, n) => { const a = (2 * Math.PI * n) / ids.length; r[i] = { x: r[i].x + radio * Math.cos(a), y: r[i].y + radio * Math.sin(a) }; });
  }
  return r;
}

export default function SimuladorLudra({ textos, locale, conocidos = [] }: {
  /** Textos sim.* y class.* en el idioma de la página */
  textos: Record<string, string>; locale: string;
  /** Jugadores de las raids públicas del jefe, con su clase (para corregir los nombres leídos de una captura) */
  conocidos?: Conocido[];
}) {
  const tr = (k: string, v?: Record<string, string | number>) => {
    const s = textos[k] ?? k;
    return v ? s.replace(/\{(\w+)\}/g, (m, x: string) => (v[x] != null ? String(v[x]) : m)) : s;
  };
  const n1 = (x: number) => x.toLocaleString(locale, { maximumFractionDigits: 1 });

  const [plan, setPlan] = useState<Plan>(PLAN_EJEMPLO);
  const [ajustes, setAjustes] = useState<Ajustes>(() => ajustesDe('prueba1'));
  const [modo, setModo] = useState<Modo>('editar');
  const [sel, setSel] = useState<string | null>(null);
  const [semilla, setSemilla] = useState(1);
  const [verSegura, setVerSegura] = useState(false);
  const [t, setT] = useState(0);
  const [jugando, setJugando] = useState(false);
  const [vel, setVel] = useState(1);
  const [arrastre, setArrastre] = useState<{ id: string; celda: Celda } | null>(null);
  const [nombresTxt, setNombresTxt] = useState('');
  const [impactosTxt, setImpactosTxt] = useState(() => ajustesDe('prueba1').impactos.join(', '));
  // Plan abierto desde un enlace (?plan=): no se guarda en este navegador hasta que se elija quedárselo
  const [delEnlace, setDelEnlace] = useState<{ anterior: { plan: Plan; ajustes: Ajustes } | null; invalido: boolean } | null>(null);
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null);
  const [plantilla, setPlantilla] = useState<NombrePlantilla>('dificil');
  const svg = useRef<SVGSVGElement>(null);
  const tRef = useRef(0);
  // Ya se leyó lo guardado o el enlace: hasta entonces no se guarda nada (un ref no vale: el efecto de guardar corre en
  // la misma pasada que el de cargar, con el plan de ejemplo, y pisaba el plan guardado)
  const [cargado, setCargado] = useState(false);

  const cargar = (d: { plan: Plan; ajustes: Ajustes }) => { setPlan(d.plan); setAjustes(d.ajustes); setImpactosTxt(d.ajustes.impactos.join(', ')); setSel(null); };
  // Recuperar el plan del enlace o lo guardado (después de hidratar, para que el HTML del servidor y el primer render
  // coincidan)
  useEffect(() => {
    const local = leerLocal(), codigo = new URLSearchParams(location.search).get('plan');
    const enlace = codigo ? leerEnlace(codigo) : null;
    /* eslint-disable react-hooks/set-state-in-effect -- la URL y localStorage solo existen en el navegador */
    setCargado(true);
    if (enlace) { cargar(enlace); setSemilla(enlace.semilla); setDelEnlace({ anterior: local, invalido: false }); return; }
    if (codigo) setDelEnlace({ anterior: null, invalido: true });
    if (local) cargar(local);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    if (!cargado || (delEnlace && !delEnlace.invalido)) return;
    try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ plan, ajustes })); } catch { /* sin almacenamiento: no pasa nada */ }
  }, [cargado, plan, ajustes, delEnlace]);
  const cerrarEnlace = (volver: boolean) => {
    if (volver && delEnlace) cargar(delEnlace.anterior ?? { plan: PLAN_EJEMPLO, ajustes: ajustesDe('prueba1') });
    setDelEnlace(null);
    const u = new URL(location.href);
    u.searchParams.delete('plan');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  };
  const copiarEnlace = async () => {
    const url = `${location.origin}${location.pathname}?plan=${codificarPlan(plan, ajustes, semilla)}#simulador`;
    try { await navigator.clipboard.writeText(url); setCopiado('si'); }
    catch { window.prompt(tr('sim.enlace.manual'), url); setCopiado('no'); }
    setTimeout(() => setCopiado(null), 4000);
  };

  const config = useMemo(() => configDe(ajustes), [ajustes]);
  const planValido = useMemo<Plan>(() => ({ jugadores: plan.jugadores.filter((j) => j.ruta.length) }), [plan]);
  const escenario = useMemo(() => escenarioAlAzar(config, azar(semilla)), [config, semilla]);
  const cob = useMemo(() => (modo === 'editar' ? cobertura(config, planValido) : null), [modo, config, planValido]);
  const resultado = useMemo(() => (modo === 'simular' ? simular(config, planValido, escenario) : null), [modo, config, planValido, escenario]);
  const pruebaTodas = useMemo(() => (modo === 'probar' ? probarTodas(config, planValido) : null), [modo, config, planValido]);
  const clases = useMemo(() => Object.entries(textos).filter(([k]) => k.startsWith('class.')).map(([k, v]): [string, string] => [k.slice(6), v])
    .sort((a, b) => a[1].localeCompare(b[1], locale)), [textos, locale]);
  const color = (id: string) => COLORES[plan.jugadores.findIndex((j) => j.id === id) % COLORES.length];
  const nombreDe = (id: string) => plan.jugadores.find((j) => j.id === id)?.nombre ?? id;

  // Reproducción
  useEffect(() => {
    if (!jugando) return;
    let id = 0, antes = performance.now();
    const paso = (ahora: number) => {
      const y = Math.min(config.final, tRef.current + ((ahora - antes) / 1000) * vel);
      antes = ahora; tRef.current = y; setT(y);
      if (y >= config.final) { setJugando(false); return; }
      id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [jugando, vel, config.final]);
  const irA = (x: number) => { tRef.current = x; setT(x); };
  const cambiarModo = (m: Modo) => { setModo(m); setJugando(false); irA(0); };

  // Edición del plan
  const cambiarJugador = (id: string, f: (j: JugadorPlan) => JugadorPlan) => setPlan((p) => ({ ...p, jugadores: p.jugadores.map((j) => (j.id === id ? f(j) : j)) }));
  const nuevoId = (p: Plan) => `j${Math.max(0, ...p.jugadores.map((j) => Number(j.id.slice(1)) || 0)) + 1}`;
  const anadir = () => {
    const id = nuevoId(plan);
    setPlan((p) => ({ ...p, jugadores: [...p.jugadores, { id, nombre: String(p.jugadores.length + 1), ruta: [] }] }));
    setSel(id);
  };
  const quitar = (id: string) => { setPlan((p) => ({ ...p, jugadores: p.jugadores.filter((j) => j.id !== id) })); if (sel === id) setSel(null); };
  /** Los caminos (y las marcas) de una plantilla para los jugadores de la lista, que conservan nombre y clase */
  const usarPlantilla = () => {
    if (!window.confirm(tr('sim.plantilla.confirmar', { p: tr(`sim.plantilla.${plantilla}`) }))) return;
    // La lista tiene como mucho 12 jugadores y la plantilla rellena hasta 10: nunca pasa de 12
    setPlan((p) => aplicarPlantilla(PLANTILLAS[plantilla], p.jugadores));
    setSel(null);
  };
  /** Nombres (y clase, si se sabe) para la lista, en orden: sustituyen a los que hay sin tocar sus caminos y, si son
   *  más, se añaden sin colocar */
  const ponerJugadores = (lista: { nombre: string; clase?: string | null }[]) => setPlan((p) => {
    const nuevos = lista.slice(0, COLORES.length);
    const js = p.jugadores.map((j, i) => (nuevos[i] ? { ...j, nombre: nuevos[i].nombre, clase: nuevos[i].clase ?? (nuevos[i].clase === null ? undefined : j.clase) } : j));
    let n = Math.max(0, ...js.map((j) => Number(j.id.slice(1)) || 0));
    for (const x of nuevos.slice(js.length)) js.push({ id: `j${++n}`, nombre: x.nombre, clase: x.clase ?? undefined, ruta: [] });
    return { ...p, jugadores: js };
  });
  const ponerNombres = () => ponerJugadores(nombresTxt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((nombre) => ({ nombre })));
  const tocarCelda = (c: Celda) => {
    if (modo !== 'editar' || !sel) return;
    cambiarJugador(sel, (j) => (j.ruta.length && iguales(j.ruta[j.ruta.length - 1].celda, c) ? j : { ...j, ruta: [...j.ruta, { celda: c, salida: 'rayo' }] }));
  };

  // Arrastrar la ficha de un jugador: mueve su casilla de salida
  const celdaDelPuntero = (e: EventoPuntero<SVGSVGElement>): Celda | null => {
    const s = svg.current, m = s?.getScreenCTM();
    if (!s || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const k = Math.floor(p.x / S), f = Math.floor(p.y / S);
    return f >= 0 && k >= 0 && f < N && k < N ? { f, k } : null;
  };
  const empezarArrastre = (e: EventoPuntero<SVGElement>, j: JugadorPlan) => {
    if (modo !== 'editar') return;
    e.stopPropagation();
    setSel(j.id);
    if (!j.ruta.length) return;
    svg.current?.setPointerCapture(e.pointerId);
    setArrastre({ id: j.id, celda: j.ruta[0].celda });
  };
  const moverArrastre = (e: EventoPuntero<SVGSVGElement>) => {
    if (!arrastre) return;
    const c = celdaDelPuntero(e);
    if (c && !iguales(c, arrastre.celda)) setArrastre({ ...arrastre, celda: c });
  };
  const soltarArrastre = () => {
    if (!arrastre) return;
    const { id, celda } = arrastre;
    cambiarJugador(id, (j) => ({ ...j, ruta: j.ruta.map((p, i) => (i === 0 ? { ...p, celda } : p)) }));
    setArrastre(null);
  };

  // ── Estado del tablero en el segundo t (modo Simular) ──
  const celdas = useMemo(() => {
    const m = new Map<string, { estado: 'marcada' | 'peligro' | 'destapada' | 'segura'; tanda: number }>();
    if (!resultado) return m;
    for (const e of resultado.eventos) {
      if (e.tipo === 'impacto' && e.t <= t) m.set(`${e.celda.f},${e.celda.k}`, { estado: e.segura ? 'segura' : 'destapada', tanda: e.tanda });
    }
    for (const e of resultado.eventos) {
      if (e.tipo !== 'marca' || e.t > t) continue;
      const tanda = config.tandas[e.tanda], clave = `${e.celda.f},${e.celda.k}`;
      if (!tanda || t >= tanda.impacto || m.get(clave)?.estado === 'segura') continue;
      m.set(clave, { estado: t >= tanda.impacto - config.margen ? 'peligro' : 'marcada', tanda: e.tanda });
    }
    return m;
  }, [resultado, t, config]);

  const fotograma = resultado?.fotogramas[Math.min(resultado.fotogramas.length - 1, Math.round(t / DT))];
  const fichas = useMemo(() => {
    if (modo === 'simular' && fotograma) {
      const pos = separar(fotograma.pos);
      return planValido.jugadores.map((j, i) => ({ j, ...pos[i], vivo: fotograma.vivo[i] }));
    }
    const js = plan.jugadores.filter((j) => j.ruta.length);
    const pos = separar(js.map((j) => centro(arrastre?.id === j.id ? arrastre.celda : j.ruta[0].celda)));
    return js.map((j, i) => ({ j, ...pos[i], vivo: true }));
  }, [modo, fotograma, planValido, plan, arrastre]);

  const segura = escenario.segura;
  const mostrarSegura = modo === 'simular' && segura && (verSegura || (resultado?.destapada != null && resultado.destapada <= t));
  const orbesActivos = modo === 'simular' ? config.orbes.filter((o) => t >= o.aviso && t <= o.impacto + 0.4) : [];
  const re = config.rayoEsquina;
  const rayoActivo = modo === 'simular' && re && t >= re.aviso && t <= re.impacto + 0.4 ? re : null;
  const esquinaLudra: Esquina | null = rayoActivo ? escenario.esquina : null;
  const ludra = esquinaLudra ? puntoEsquina(esquinaLudra, N) : null;
  // En la esquina, Ludra se pinta encima de su marca (1–4)
  const ludraPx = ludra ? { x: px(ludra.x) + (ludra.x ? 34 : -34), y: px(ludra.y) + (ludra.y ? 34 : -34) } : { x: px(N / 2), y: -M + 22 };
  const seleccionado = plan.jugadores.find((j) => j.id === sel) ?? null;
  const huecos = cob?.huecos.length ?? 0;
  const causa = (c: Causa) => tr(`sim.causa.${c}`);

  const leyenda = modo === 'simular'
    ? [['is-marcada', 'sim.leyenda.marcada'], ['is-peligro', 'sim.leyenda.peligro'], ['is-destapada', 'sim.leyenda.destapada'], ['is-segura', 'sim.leyenda.segura']]
    : [];

  return (
    <div className="sim">
      <p className="rx-note">{tr('sim.intro')}</p>

      {delEnlace ? (
        <div className="rx-pending sim-aviso" role="status">
          <span>{tr(delEnlace.invalido ? 'sim.enlace.invalido' : 'sim.enlace.viendo')}</span>
          <span className="cx-fila">
            {delEnlace.invalido ? (
              <button type="button" className="cx-boton cx-boton-sec" onClick={() => cerrarEnlace(false)}>{tr('sim.captura.cerrar')}</button>
            ) : (
              <>
                <button type="button" className="cx-boton" onClick={() => cerrarEnlace(false)}>{tr('sim.enlace.quedar')}</button>
                <button type="button" className="cx-boton cx-boton-sec" onClick={() => cerrarEnlace(true)}>{tr(delEnlace.anterior ? 'sim.enlace.volver' : 'sim.enlace.descartar')}</button>
              </>
            )}
          </span>
        </div>
      ) : null}

      <div className="sim-barra">
        <label className="sim-campo">
          <span>{tr('sim.prueba')}</span>
          <select className="cx-select" value={ajustes.prueba} onChange={(e) => { const a = ajustesDe(e.target.value as Prueba); setAjustes(a); setImpactosTxt(a.impactos.join(', ')); irA(0); }}>
            {(Object.keys(PRESETS) as Prueba[]).map((p) => <option key={p} value={p}>{tr(`sim.prueba.${p}`)}</option>)}
          </select>
        </label>
        <div className="rx-lang sim-modos" role="group" aria-label={tr('sim.modos')}>
          {MODOS.map((m) => <button key={m} type="button" aria-pressed={modo === m} onClick={() => cambiarModo(m)}>{tr(`sim.modo.${m}`)}</button>)}
        </div>
        <span className="cx-fila sim-compartir">
          <button type="button" className="cx-boton cx-boton-sec" onClick={() => void copiarEnlace()} disabled={!planValido.jugadores.length}>{tr('sim.enlace.copiar')}</button>
          <span className="hm-sub" aria-live="polite">{copiado === 'si' ? tr('sim.enlace.copiado') : null}</span>
        </span>
      </div>

      <div className="sim-cuerpo">
        <div className="sim-tablero">
          <svg ref={svg} viewBox={`${-M} ${-M} ${N * S + 2 * M} ${N * S + 2 * M}`} role="img" aria-label={tr('sim.aria')}
            onPointerMove={moverArrastre} onPointerUp={soltarArrastre} onPointerCancel={() => setArrastre(null)} className={arrastre ? 'is-arrastre' : undefined}>
            {/* Letras de columna y números de fila */}
            {Array.from({ length: N }, (_, i) => (
              <g key={i} className="sim-eje">
                <text x={px(i + 0.5)} y={-8} textAnchor="middle">{LETRAS[i]}</text>
                <text x={-10} y={px(i + 0.5) + 4} textAnchor="end">{i + 1}</text>
              </g>
            ))}
            {/* Marcas 1–4 del juego en las esquinas, si la plantilla no las pone en casillas (eso, tras las casillas) */}
            {plan.marcas?.length ? null : ([1, 2, 3, 4] as Esquina[]).map((e) => {
              const p = puntoEsquina(e, N);
              return (
                <g key={e} className="sim-esquina">
                  <circle cx={px(p.x) + (p.x ? 34 : -34)} cy={px(p.y) + (p.y ? 34 : -34)} r={11} />
                  <text x={px(p.x) + (p.x ? 34 : -34)} y={px(p.y) + (p.y ? 34 : -34) + 4} textAnchor="middle">{e}</text>
                </g>
              );
            })}
            {/* Casillas */}
            {Array.from({ length: N * N }, (_, i) => {
              const f = Math.floor(i / N), k = i % N, x = px(k), y = px(f);
              const enSim = celdas.get(`${f},${k}`);
              const prob = pruebaTodas?.casillas.find((c) => c.celda.f === f && c.celda.k === k);
              const tanda = cob?.tanda[f][k];
              let clase = 'sim-celda';
              let texto: string | null = null;
              let opacidad: number | undefined;
              if (modo === 'editar') {
                if (tanda == null) clase += ' is-hueco';
                else texto = String(tanda + 1);
              } else if (modo === 'simular' && enSim) {
                clase += ` is-${enSim.estado}`;
                if (enSim.estado === 'marcada' || enSim.estado === 'peligro') texto = String(enSim.tanda + 1);
              } else if (modo === 'probar' && prob) {
                const r = prob.exitos / prob.total;
                clase += r === 1 ? ' is-ok' : r === 0 ? ' is-mal' : ' is-medio';
                opacidad = r === 1 || r === 0 ? undefined : 0.35 + 0.5 * (1 - r);
                texto = prob.destapada === null ? '–' : `${prob.exitos}/${prob.total}`;
              }
              return (
                <g key={i} onClick={() => tocarCelda({ f, k })} className={modo === 'editar' && sel ? 'sim-tocable' : undefined}>
                  <rect x={x} y={y} width={S} height={S} className={clase} style={opacidad ? { fillOpacity: opacidad } : undefined} />
                  {modo === 'simular' && enSim?.estado === 'destapada' ? <path d={`M${x + 18},${y + 18}L${x + S - 18},${y + S - 18}M${x + S - 18},${y + 18}L${x + 18},${y + S - 18}`} className="sim-x" /> : null}
                  {texto ? <text x={x + S / 2} y={y + S / 2 + 4} textAnchor="middle" className="sim-celda-t">{texto}</text> : null}
                </g>
              );
            })}
            {mostrarSegura && segura ? <rect x={px(segura.k) + 3} y={px(segura.f) + 3} width={S - 6} height={S - 6} className="sim-segura-marco" /> : null}
            {plan.marcas?.map((c, i) => (
              <g key={i} className="sim-esquina sim-marca">
                <circle cx={px(c.k) + 12} cy={px(c.f) + 12} r={9} />
                <text x={px(c.k) + 12} y={px(c.f) + 15.5} textAnchor="middle">{i + 1}</text>
              </g>
            ))}

            {/* Peligros: orbes laterales y rayo de esquina a esquina */}
            {orbesActivos.map((o) => (
              <circle key={o.id} cx={px(o.x)} cy={px(o.y)} r={px(o.radio)} className={`sim-orbe${t >= o.impacto ? ' is-impacto' : ''}`} />
            ))}
            {rayoActivo && esquinaLudra ? (() => {
              const a = puntoEsquina(esquinaLudra, N), b = puntoEsquina(opuesta(esquinaLudra), N);
              const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy), nx = (-dy / l) * (rayoActivo.ancho / 2), ny = (dx / l) * (rayoActivo.ancho / 2);
              const d = `M${px(a.x + nx)},${px(a.y + ny)}L${px(b.x + nx)},${px(b.y + ny)}L${px(b.x - nx)},${px(b.y - ny)}L${px(a.x - nx)},${px(a.y - ny)}Z`;
              return <path d={d} className={`sim-rayo${t >= rayoActivo.impacto ? ' is-impacto' : ''}`} />;
            })() : null}

            {/* Ludra */}
            <g className="sim-ludra">
              <circle cx={ludraPx.x} cy={ludraPx.y} r={16} />
              <text x={ludraPx.x} y={ludraPx.y + 4} textAnchor="middle">{tr('sim.ludra').slice(0, 1)}</text>
            </g>

            {/* Caminos (Planificar) */}
            {modo === 'editar' && plan.jugadores.map((j) => {
              if (j.ruta.length < 2 && j.id !== sel) return null;
              const pts = j.ruta.map((p) => centro(p.celda));
              const activo = j.id === sel;
              return (
                <g key={j.id} className={`sim-camino${activo ? ' is-sel' : ''}`} style={{ color: color(j.id) }}>
                  <polyline points={pts.map((p) => `${px(p.x)},${px(p.y)}`).join(' ')} />
                  {activo ? pts.map((p, i) => <text key={i} x={px(p.x) + 14} y={px(p.y) - 12} className="sim-paso">{i + 1}</text>) : null}
                </g>
              );
            })}

            {/* Jugadores */}
            {fichas.map(({ j, x, y, vivo }) => (
              <g key={j.id} className={`sim-ficha${vivo ? '' : ' is-muerto'}${j.id === sel ? ' is-sel' : ''}`} transform={`translate(${x},${y})`}
                onPointerDown={(e) => empezarArrastre(e, j)}>
                <circle r={12} style={{ fill: color(j.id) }} />
                <text y={4} textAnchor="middle">{j.nombre.slice(0, 2)}</text>
                {!vivo ? <path d="M-8,-8L8,8M8,-8L-8,8" className="sim-cruz" /> : null}
              </g>
            ))}
          </svg>
          {leyenda.length ? (
            <ul className="sim-leyenda">
              {leyenda.map(([c, k]) => <li key={c}><span className={`sim-muestra ${c}`} aria-hidden="true" />{tr(k)}</li>)}
            </ul>
          ) : null}
        </div>

        <div className="sim-panel">
          {modo === 'editar' ? (
            <>
              <p className={huecos ? 'rx-pending' : 'rx-note'}>
                {tr('sim.cobertura')} {huecos ? tr(huecos === 1 ? 'sim.hueco' : 'sim.huecos', { n: huecos }) : tr('sim.sinHuecos')}
              </p>
              <section className="rx-card sim-jugadores">
                <h3>{tr('sim.jugadores')}</h3>
                <ul>
                  {plan.jugadores.map((j) => (
                    <li key={j.id} className={j.id === sel ? 'is-sel' : undefined}>
                      <button type="button" className="sim-color" style={{ background: color(j.id) }} aria-pressed={j.id === sel}
                        aria-label={tr('sim.elegir', { j: j.nombre })} onClick={() => setSel(j.id === sel ? null : j.id)} />
                      <input className="cx-input" value={j.nombre} maxLength={24} aria-label={tr('sim.nombre')}
                        onChange={(e) => cambiarJugador(j.id, (x) => ({ ...x, nombre: e.target.value }))} onFocus={() => setSel(j.id)} />
                      <select className="cx-select sim-clase" value={j.clase ?? ''} aria-label={tr('sim.clase')}
                        onChange={(e) => cambiarJugador(j.id, (x) => ({ ...x, clase: e.target.value || undefined }))}>
                        <option value="">{tr('sim.clase.ninguna')}</option>
                        {clases.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                      </select>
                      <span className="hm-sub">{j.ruta.length ? tr(j.ruta.length === 1 ? 'sim.parada' : 'sim.paradas', { n: j.ruta.length }) : tr('sim.sinColocar')}</span>
                      <button type="button" className="sim-quitar" aria-label={tr('sim.quitar', { j: j.nombre })} onClick={() => quitar(j.id)}>×</button>
                    </li>
                  ))}
                </ul>
                <p className="cx-fila">
                  <button type="button" className="cx-boton cx-boton-sec" onClick={() => anadir()} disabled={plan.jugadores.length >= COLORES.length}>{tr('sim.anadir')}</button>
                </p>
                <p className="cx-fila sim-plantilla">
                  <label className="sim-campo">
                    <span>{tr('sim.plantilla')}</span>
                    <select className="cx-select" value={plantilla} onChange={(e) => setPlantilla(e.target.value as NombrePlantilla)}>
                      {(Object.keys(PLANTILLAS) as NombrePlantilla[]).map((p) => <option key={p} value={p}>{tr(`sim.plantilla.${p}`)}</option>)}
                    </select>
                  </label>
                  <button type="button" className="cx-boton cx-boton-sec" onClick={usarPlantilla}>{tr('sim.plantilla.aplicar')}</button>
                </p>
                <p className="hm-sub">{tr(`sim.plantilla.${plantilla}.nota`)}</p>
                <LectorCaptura conocidos={conocidos} clases={clases} tr={tr} alUsar={ponerJugadores} />
                <details>
                  <summary className="hm-sub">{tr('sim.nombres')}</summary>
                  <textarea className="cx-input sim-nombres" rows={5} value={nombresTxt} onChange={(e) => setNombresTxt(e.target.value)} placeholder={tr('sim.nombres.ph')} />
                  <button type="button" className="cx-boton cx-boton-sec" onClick={ponerNombres}>{tr('sim.nombres.poner')}</button>
                </details>
              </section>

              <section className="rx-card">
                {seleccionado ? (
                  <>
                    <h3>{tr('sim.ruta', { j: seleccionado.nombre })}</h3>
                    <p className="hm-sub">{tr('sim.ruta.ayuda')}</p>
                    {seleccionado.ruta.length ? (
                      <ol className="sim-paradas">
                        {seleccionado.ruta.map((p, i) => {
                          const tipo = typeof p.salida === 'object' ? 't' : p.salida;
                          const cambiar = (salida: Parada['salida']) => cambiarJugador(seleccionado.id, (j) => ({ ...j, ruta: j.ruta.map((x, n) => (n === i ? { ...x, salida } : x)) }));
                          return (
                            <li key={i}>
                              <strong>{nombreCelda(p.celda)}</strong>
                              <select className="cx-select" value={tipo} aria-label={tr('sim.salida')}
                                onChange={(e) => cambiar(e.target.value === 't' ? { t: 0 } : (e.target.value as 'rayo' | 'pasar'))}>
                                <option value="rayo">{tr('sim.salida.rayo')}</option>
                                <option value="pasar">{tr('sim.salida.pasar')}</option>
                                <option value="t">{tr('sim.salida.t')}</option>
                              </select>
                              {typeof p.salida === 'object' ? (
                                <input type="number" className="cx-input sim-num" min={0} step={0.5} value={p.salida.t} aria-label={tr('sim.salida.t')}
                                  onChange={(e) => cambiar({ t: Math.max(0, Number(e.target.value) || 0) })} />
                              ) : null}
                              <button type="button" className="sim-quitar" aria-label={tr('sim.quitarParada', { c: nombreCelda(p.celda) })}
                                onClick={() => cambiarJugador(seleccionado.id, (j) => ({ ...j, ruta: j.ruta.filter((_, n) => n !== i) }))}>×</button>
                            </li>
                          );
                        })}
                      </ol>
                    ) : <p className="rx-pending">{tr('sim.ruta.vacia')}</p>}
                    {seleccionado.ruta.length ? (
                      <p><button type="button" className="cx-boton cx-boton-sec" onClick={() => cambiarJugador(seleccionado.id, (j) => ({ ...j, ruta: [] }))}>{tr('sim.ruta.borrar')}</button></p>
                    ) : null}
                  </>
                ) : <p className="hm-sub">{tr('sim.elige')}</p>}
              </section>
            </>
          ) : null}

          {modo === 'simular' && resultado ? (
            <>
              <div className="cx-fila sim-controles">
                <button type="button" className="cx-boton" onClick={() => { if (t >= config.final) irA(0); setJugando(!jugando); }}>{jugando ? tr('sim.pausa') : tr('sim.play')}</button>
                <button type="button" className="cx-boton cx-boton-sec" onClick={() => { setJugando(false); irA(0); }}>{tr('sim.inicio')}</button>
                <button type="button" className="cx-boton cx-boton-sec" onClick={() => { setSemilla((s) => s + 1); setJugando(false); irA(0); }}>{tr('sim.otra')}</button>
                <label className="sim-campo">
                  <span>{tr('sim.velocidad')}</span>
                  <select className="cx-select" value={vel} onChange={(e) => setVel(Number(e.target.value))}>
                    {[0.25, 0.5, 1, 2].map((v) => <option key={v} value={v}>×{n1(v)}</option>)}
                  </select>
                </label>
              </div>
              <label className="sim-tiempo">
                <input type="range" min={0} max={config.final} step={DT} value={t} onChange={(e) => { setJugando(false); irA(Number(e.target.value)); }} aria-label={tr('sim.tiempo')} />
                <span>{tr('sim.s', { n: n1(t) })}</span>
              </label>
              <label className="sim-check"><input type="checkbox" checked={verSegura} onChange={(e) => setVerSegura(e.target.checked)} /> {tr('sim.verSegura')}</label>
              {t >= config.final ? (
                <p className={resultado.exito ? 'sim-res is-ok' : 'sim-res is-mal'}>
                  {resultado.exito ? tr('sim.res.exito', { t: n1(resultado.destapada ?? 0) })
                    : resultado.destapada === null ? tr('sim.res.sinDestapar')
                      : tr(resultado.muertos.length === 1 ? 'sim.res.muerto' : 'sim.res.muertos', { n: resultado.muertos.length, t: n1(resultado.destapada) })}
                </p>
              ) : null}
              <ol className="sim-log" aria-live="polite">
                {resultado.eventos.filter((e) => e.t <= t && e.tipo !== 'marca' && !(e.tipo === 'impacto' && e.segura)).reverse().map((e, i) => (
                  <li key={i} className={e.tipo === 'golpe' && e.muere ? 'is-mal' : e.tipo === 'destapada' ? 'is-ok' : undefined}>
                    <span className="sim-log-t">{tr('sim.s', { n: n1(e.t) })}</span>{' '}
                    {e.tipo === 'impacto' ? tr('sim.ev.impacto', { c: nombreCelda(e.celda), n: e.tanda + 1 })
                      : e.tipo === 'destapada' ? tr('sim.ev.destapada', { c: nombreCelda(e.celda) })
                        : e.tipo === 'golpe' ? tr(e.muere ? 'sim.ev.muere' : 'sim.ev.golpe', { j: nombreDe(e.jugador), causa: causa(e.causa) }) : null}
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {modo === 'probar' && pruebaTodas ? (
            <div className="rx-card">
              <p className={pruebaTodas.exitos === pruebaTodas.total ? 'sim-res is-ok' : 'sim-res is-mal'}>
                {tr('sim.probar.resumen', { e: pruebaTodas.exitos, t: pruebaTodas.total })}
              </p>
              <p className="hm-sub">{tr(config.rayoEsquina?.esquina === 'azar' ? 'sim.probar.casosEsquinas' : 'sim.probar.casos', { n: N * N })}</p>
              {pruebaTodas.sinDestapar ? <p className="rx-pending">{tr(pruebaTodas.sinDestapar === 1 ? 'sim.hueco' : 'sim.huecos', { n: pruebaTodas.sinDestapar })}</p> : null}
              {(() => {
                const total: Partial<Record<Causa, number>> = {};
                for (const c of pruebaTodas.casillas) for (const [k, v] of Object.entries(c.muertes)) total[k as Causa] = (total[k as Causa] ?? 0) + v;
                const lista = Object.entries(total).sort((a, b) => b[1] - a[1]);
                return lista.length ? <p className="cx-texto">{tr('sim.probar.causas', { lista: lista.map(([k, v]) => `${causa(k as Causa)} (${v})`).join(', ') })}</p> : null;
              })()}
              <p className="hm-sub">{tr('sim.probar.leyenda')}</p>
            </div>
          ) : null}

          <details className="rx-card sim-ajustes">
            <summary>{tr('sim.ajustes')}</summary>
            <p className="hm-sub">{tr('sim.aj.nota')}</p>
            <div className="sim-campos">
              {([['velocidad', 'sim.aj.velocidad', 0.1], ['aviso', 'sim.aj.aviso', 0.5], ['margen', 'sim.aj.margen', 0.1], ['reaccion', 'sim.aj.reaccion', 0.1], ['final', 'sim.aj.final', 0.5]] as const).map(([campo, k, paso]) => (
                <label key={campo} className="sim-campo">
                  <span>{tr(k)}</span>
                  <input type="number" className="cx-input sim-num" min={0} step={paso} value={ajustes[campo]}
                    onChange={(e) => setAjustes((a) => ({ ...a, [campo]: Math.max(0, Number(e.target.value) || 0) }))} />
                </label>
              ))}
              <label className="sim-campo">
                <span>{tr('sim.aj.impactos')}</span>
                <input className="cx-input" value={impactosTxt} onChange={(e) => setImpactosTxt(e.target.value)}
                  onBlur={() => setAjustes((a) => ({ ...a, impactos: impactosTxt.split(/[\s,;]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => x > 0) }))} />
              </label>
              <label className="sim-campo">
                <span>{tr('sim.aj.alFallar')}</span>
                <select className="cx-select" value={ajustes.alFallar} onChange={(e) => setAjustes((a) => ({ ...a, alFallar: e.target.value as Ajustes['alFallar'] }))}>
                  <option value="muere">{tr('sim.aj.muere')}</option>
                  <option value="marca">{tr('sim.aj.marca')}</option>
                </select>
              </label>
              <label className="sim-check">
                <input type="checkbox" checked={ajustes.esquivar ?? true} onChange={(e) => setAjustes((a) => ({ ...a, esquivar: e.target.checked }))} /> {tr('sim.aj.esquivar')}
              </label>
              {([['orbes', 'sim.aj.orbes'], ['esquina', 'sim.aj.esquina']] as const).map(([campo, k]) => {
                const peligro = PELIGROS[ajustes.prueba];
                const def = campo === 'orbes' ? peligro.orbes[0].impacto : peligro.rayoEsquina.impacto;
                return (
                  <label key={campo} className="sim-campo">
                    <span className="sim-check">
                      <input type="checkbox" checked={ajustes[campo] !== null} onChange={(e) => setAjustes((a) => ({ ...a, [campo]: e.target.checked ? def : null }))} /> {tr(k)}
                    </span>
                    {ajustes[campo] !== null ? (
                      <input type="number" className="cx-input sim-num" min={0} step={0.5} value={ajustes[campo]!} aria-label={tr(k)}
                        onChange={(e) => setAjustes((a) => ({ ...a, [campo]: Math.max(0, Number(e.target.value) || 0) }))} />
                    ) : null}
                  </label>
                );
              })}
            </div>
            <p><button type="button" className="cx-boton cx-boton-sec" onClick={() => { const a = ajustesDe(ajustes.prueba); setAjustes(a); setImpactosTxt(a.impactos.join(', ')); }}>{tr('sim.aj.restaurar')}</button></p>
          </details>
        </div>
      </div>
    </div>
  );
}
