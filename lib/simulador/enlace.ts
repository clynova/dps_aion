// Enlace para compartir un plan del simulador de Ludra (fase 4, docs/plan-simulador-ludra.md): `?plan=<código>` en la
// URL de la ficha de Ludra (con #simulador para abrir la pestaña). El código es JSON corto en base64url, sin base de
// datos: quien abre el enlace ve los mismos jugadores, caminos, ajustes y caso de Simular. Puro (pruebas en
// tests/unit/simulador-enlace.test.ts). Como lo que llega en la URL lo puede escribir cualquiera, `leerEnlace`
// lo valida campo a campo y devuelve null ante cualquier cosa rara.
//
// Formato v1: { v: 1, p: prueba, j: [[nombre, clase, camino], …], a?: ajustes que cambian, s?: semilla }
//   camino: paradas separadas por espacios, «B3» (espera el rayo), «B3p» (pasa de largo) o «B3t12.5» (sale a los 12,5 s)
import { ajustesDe, type Ajustes, type Prueba } from './ajustes';
import { PRESETS, problemasDelPlan, type Parada, type Plan } from './ludra';

export const MAX_JUGADORES = 12;
const MAX_PARADAS = 40;
const LETRAS = 'ABCDEF';

type EnlaceV1 = { v: 1; p: Prueba; j: [string, string, string][]; a?: Partial<Omit<Ajustes, 'prueba'>>; s?: number };

const parada = (x: Parada) => `${LETRAS[x.celda.k]}${x.celda.f + 1}${x.salida === 'rayo' ? '' : x.salida === 'pasar' ? 'p' : `t${Math.min(999, Math.round(x.salida.t * 100) / 100)}`}`;

function aBase64url(s: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deBase64url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** El código del plan (solo los jugadores colocados y los ajustes que no son los de por defecto). */
export function codificarPlan(plan: Plan, ajustes: Ajustes, semilla?: number): string {
  const base = ajustesDe(ajustes.prueba), a: Record<string, unknown> = {};
  for (const k of Object.keys(ajustes) as (keyof Ajustes)[]) {
    if (k !== 'prueba' && JSON.stringify(ajustes[k] ?? null) !== JSON.stringify(base[k] ?? null)) a[k] = ajustes[k];
  }
  const d: EnlaceV1 = {
    v: 1, p: ajustes.prueba,
    j: plan.jugadores.filter((j) => j.ruta.length).slice(0, MAX_JUGADORES).map((j) => [j.nombre, j.clase ?? '', j.ruta.map(parada).join(' ')]),
  };
  if (Object.keys(a).length) d.a = a as EnlaceV1['a'];
  if (semilla !== undefined && semilla !== 1) d.s = semilla;
  return aBase64url(JSON.stringify(d));
}

const num = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

function leerParadas(camino: string): Parada[] | null {
  const trozos = camino.trim().split(/\s+/).filter(Boolean);
  if (!trozos.length || trozos.length > MAX_PARADAS) return null;
  const r: Parada[] = [];
  for (const t of trozos) {
    const m = t.match(/^([A-F])([1-6])(p|t(\d{1,3}(?:\.\d{1,2})?))?$/);
    if (!m) return null;
    const celda = { f: Number(m[2]) - 1, k: LETRAS.indexOf(m[1]) };
    r.push({ celda, salida: !m[3] ? 'rayo' : m[3] === 'p' ? 'pasar' : { t: Number(m[4]) } });
  }
  return r;
}

function leerAjustes(prueba: Prueba, a: unknown): Ajustes | null {
  const r = ajustesDe(prueba);
  if (a === undefined) return r;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  for (const [k, v] of Object.entries(a)) {
    switch (k) {
      case 'velocidad': if (!num(v, 0.2, 20)) return null; r.velocidad = v; break;
      case 'aviso': case 'margen': case 'reaccion': if (!num(v, 0, 30)) return null; r[k] = v; break;
      case 'final': if (!num(v, 1, 120)) return null; r.final = v; break;
      case 'impactos': if (!Array.isArray(v) || v.length > 12 || !v.every((x) => num(x, 0.1, 120))) return null; r.impactos = v; break;
      case 'alFallar': if (v !== 'muere' && v !== 'marca') return null; r.alFallar = v; break;
      case 'orbes': case 'esquina': if (v !== null && !num(v, 0, 120)) return null; r[k] = v; break;
      case 'esquivar': if (typeof v !== 'boolean') return null; r.esquivar = v; break;
      default: return null;
    }
  }
  return r;
}

/** El plan de un código de enlace, o null si no es válido. */
export function leerEnlace(codigo: string): { plan: Plan; ajustes: Ajustes; semilla: number } | null {
  if (!codigo || codigo.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(codigo)) return null;
  let d: unknown;
  try { d = JSON.parse(deBase64url(codigo)); } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  const e = d as Partial<EnlaceV1>;
  if (e.v !== 1 || typeof e.p !== 'string' || !(e.p in PRESETS) || !Array.isArray(e.j) || e.j.length > MAX_JUGADORES) return null;
  const ajustes = leerAjustes(e.p as Prueba, e.a);
  if (!ajustes) return null;
  const jugadores: Plan['jugadores'] = [];
  for (const [i, x] of e.j.entries()) {
    if (!Array.isArray(x) || x.length !== 3 || !x.every((y) => typeof y === 'string')) return null;
    const [nombre, clase, camino] = x as [string, string, string];
    if (nombre.length > 24 || !/^[a-z_-]{0,20}$/.test(clase)) return null;
    const ruta = leerParadas(camino);
    if (!ruta) return null;
    jugadores.push({ id: `j${i + 1}`, nombre: nombre.trim() || String(i + 1), ...(clase ? { clase } : {}), ruta });
  }
  const plan = { jugadores };
  if (problemasDelPlan(PRESETS[ajustes.prueba], plan).length) return null;
  const semilla = e.s === undefined ? 1 : Number.isInteger(e.s) && num(e.s, 1, 1e9) ? e.s : null;
  if (semilla === null) return null;
  return { plan, ajustes, semilla };
}
