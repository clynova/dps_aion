// Simulador de la Prueba de Ludra (el «bingo»): motor puro, sin interfaz ni red. Se prueba en
// tests/unit/simulador-ludra.test.ts; el plan por fases está en docs/plan-simulador-ludra.md.
//
// Cómo se modela (lo que cuenta el grupo, con tiempos por defecto sacados de nuestros registros y todo configurable):
// - El suelo es un tablero de `tamano`×`tamano` casillas; la fila 0 es la del lado de Ludra y las esquinas se numeran
//   1 (arriba a la izquierda), 2 (arriba a la derecha), 3 (abajo a la izquierda) y 4 (abajo a la derecha). Las
//   posiciones van en casillas: el centro de la casilla (f, k) es (k + 0,5, f + 0,5).
// - Una casilla es la segura y no se ve. En cada tanda de rayos, al `aviso` se marca la casilla donde está cada jugador
//   vivo y al `impacto` cae el rayo en las marcadas: la casilla queda destapada (segura o no). Quien esté en una casilla
//   marcada que no es la segura en el último `margen` (1 s) antes del impacto recibe el rayo: muere o se le marca
//   (`alFallar`). Cuenta también quien solo pasa por ella.
// - Cuando cae un rayo en la segura, queda destapada; `reaccion` segundos después todos van hacia ella en línea recta.
//   En el golpe `final` muere quien no esté en la segura (si no se destapó, todo el grupo).
// - Peligros aparte: orbes de energía a los lados que explotan en un radio y el rayo que Ludra lanza de una esquina a
//   la opuesta. No se esquivan solos: los esquiva el plan (o no).
// - Cada jugador sigue su ruta de paradas. En cada parada sale según `salida`: 'pasar' (sigue sin parar), { t } (sale
//   en ese segundo) o 'rayo' (espera a que le marquen la casilla en la siguiente tanda y sale a tiempo de estar fuera
//   `margen` + `holgura` antes del impacto). Si la última parada es 'rayo', al salir vuelve a la parada anterior (o a la
//   casilla vecina hacia el centro) y se queda allí.
// El tiempo avanza en pasos de DT segundos; los segundos de cada evento se redondean al paso más cercano.

export const DT = 0.05;

export type Celda = { f: number; k: number };
export type Punto = { x: number; y: number };
export type Esquina = 1 | 2 | 3 | 4;
export type Efecto = 'muerte' | 'golpe';
export type Tanda = { aviso: number; impacto: number };
export type Orbe = { id: string; aviso: number; impacto: number; x: number; y: number; radio: number; efecto: Efecto };
export type RayoEsquina = { aviso: number; impacto: number; esquina: Esquina | 'azar'; ancho: number; efecto: Efecto };

export type Config = {
  tamano: number;
  /** Casillas por segundo */
  velocidad: number;
  tandas: Tanda[];
  /** Segundos antes del impacto en que ya hay que estar fuera de la casilla marcada */
  margen: number;
  /** Segundos de más con los que sale quien espera el rayo */
  holgura: number;
  /** Segundos desde que se destapa la segura hasta que el grupo echa a andar hacia ella */
  reaccion: number;
  /** Segundo del golpe final: fuera de la segura, muerte */
  final: number;
  alFallar: 'muere' | 'marca';
  orbes: Orbe[];
  rayoEsquina: RayoEsquina | null;
};

export type Salida = 'rayo' | 'pasar' | { t: number };
export type Parada = { celda: Celda; salida: Salida };
export type JugadorPlan = { id: string; nombre: string; clase?: string; ruta: Parada[] };
export type Plan = { jugadores: JugadorPlan[] };
export type Escenario = { segura: Celda | null; esquina: Esquina };

export type Causa = 'rayo' | 'final' | 'orbe' | 'rayo-esquina';
export type Evento =
  | { t: number; tipo: 'marca'; tanda: number; celda: Celda; jugadores: string[] }
  | { t: number; tipo: 'impacto'; tanda: number; celda: Celda; segura: boolean }
  | { t: number; tipo: 'destapada'; celda: Celda }
  | { t: number; tipo: 'golpe'; jugador: string; causa: Causa; muere: boolean };
export type Fotograma = { t: number; pos: Punto[]; vivo: boolean[] };
export type Resultado = {
  escenario: Escenario;
  eventos: Evento[];
  muertos: { jugador: string; t: number; causa: Causa }[];
  /** Golpes que no matan (orbes o rayos de efecto 'golpe', o rayos con alFallar = 'marca') */
  golpes: { jugador: string; t: number; causa: Causa }[];
  /** Segundo en que se destapó la segura (null: nadie la destapó) */
  destapada: number | null;
  /** Segundo en que cada jugador llegó a la segura (null: no llegó) */
  llegadas: Record<string, number | null>;
  /** Nadie muere */
  exito: boolean;
  fotogramas: Fotograma[];
};

// Tiempos por defecto, de nuestros registros (db/aion.duckdb, 117 Pruebas): en la primera (1803010, barra de 1,7 s)
// los rayos (1803012) caen hacia los 5, 9, 13 y 16-17 s del casteo y el golpe final (1803011, ~140 000 de daño) a los
// 20 s; en la segunda (1803040) los rayos caen hacia los 11, 14-15, 18 y 22 s y no hay registro claro del final. Cuándo
// sale la marca no lo dice el registro: 2,5 s antes del impacto. Qué ataque son los orbes y el rayo de esquina es una
// deducción sin confirmar (1803203 hacia los 16 s y 1803110, barra de 1,5 s, hacia los 10 s, en la primera); sus zonas
// son un esquema hasta que el grupo las ajuste.
const AVISO = 2.5;
const tandas = (impactos: number[]): Tanda[] => impactos.map((impacto) => ({ aviso: Math.max(0, impacto - AVISO), impacto }));
const BASE = { tamano: 6, velocidad: 2, margen: 1, holgura: 0.2, reaccion: 0.5, alFallar: 'muere' as const };
const orbesLaterales = (impacto: number, tamano = 6): Orbe[] => [
  { id: 'izquierda', aviso: impacto - 3, impacto, x: -0.5, y: tamano / 2, radio: 2, efecto: 'golpe' },
  { id: 'derecha', aviso: impacto - 3, impacto, x: tamano + 0.5, y: tamano / 2, radio: 2, efecto: 'golpe' },
];
export const PRESETS: Record<'prueba1' | 'prueba2', Config> = {
  prueba1: {
    ...BASE, tandas: tandas([5, 9, 13, 16.5]), final: 20, orbes: orbesLaterales(16),
    rayoEsquina: { aviso: 8.5, impacto: 10, esquina: 'azar', ancho: 1, efecto: 'muerte' },
  },
  prueba2: {
    ...BASE, tandas: tandas([11, 14.5, 18, 22]), final: 26, orbes: orbesLaterales(19),
    rayoEsquina: { aviso: 14.5, impacto: 16, esquina: 'azar', ancho: 1, efecto: 'muerte' },
  },
};

const tick = (s: number) => Math.round(s / DT);
const misma = (a: Celda, b: Celda | null) => !!b && a.f === b.f && a.k === b.k;
export const centro = (c: Celda): Punto => ({ x: c.k + 0.5, y: c.f + 0.5 });
const dentro = (n: number, x: number) => Math.min(n - 1, Math.max(0, Math.floor(x)));
export const celdaDe = (p: Punto, tamano: number): Celda => ({ f: dentro(tamano, p.y), k: dentro(tamano, p.x) });
const dist = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);

/** Coordenadas de una esquina del tablero (1 arriba-izq., 2 arriba-der., 3 abajo-izq., 4 abajo-der.) */
export const puntoEsquina = (e: Esquina, n: number): Punto => ({ x: e === 2 || e === 4 ? n : 0, y: e >= 3 ? n : 0 });
export const opuesta = (e: Esquina): Esquina => (5 - e) as Esquina;

/** Distancia de p al segmento a–b */
function distSegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return dist(p, { x: a.x + u * dx, y: a.y + u * dy });
}

type Estado = {
  pos: Punto; idx: number; fase: 'yendo' | 'esperando' | 'quieto'; salir: number | null; objetivo: Punto;
  vivo: boolean; aSegura: boolean; refugio: boolean; golpeado: Set<number>;
};

/** Generador pseudoaleatorio con semilla (mulberry32), para repetir una simulación */
export function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function escenarioAlAzar(config: Config, rng: () => number): Escenario {
  const n = config.tamano, i = Math.floor(rng() * n * n);
  const fija = config.rayoEsquina && config.rayoEsquina.esquina !== 'azar' ? config.rayoEsquina.esquina : null;
  return { segura: { f: Math.floor(i / n), k: i % n }, esquina: fija ?? ((1 + Math.floor(rng() * 4)) as Esquina) };
}

/** Comprueba que el plan se puede simular; devuelve los problemas (vacío si está bien). */
export function problemasDelPlan(config: Config, plan: Plan): string[] {
  const p: string[] = [], ids = new Set<string>();
  for (const j of plan.jugadores) {
    if (ids.has(j.id)) p.push(`id repetido: ${j.id}`);
    ids.add(j.id);
    if (!j.ruta.length) p.push(`${j.id}: sin casilla de salida`);
    for (const { celda: c } of j.ruta) {
      if (!Number.isInteger(c.f) || !Number.isInteger(c.k) || c.f < 0 || c.k < 0 || c.f >= config.tamano || c.k >= config.tamano) {
        p.push(`${j.id}: casilla fuera del tablero (${c.f}, ${c.k})`);
      }
    }
  }
  return p;
}

export function simular(config: Config, plan: Plan, escenario: Escenario, opciones: { fotogramas?: boolean } = {}): Resultado {
  const problemas = problemasDelPlan(config, plan);
  if (problemas.length) throw new Error(problemas.join('; '));
  const n = config.tamano, v = config.velocidad, { segura } = escenario;
  const js = plan.jugadores;
  const eventos: Evento[] = [], muertos: Resultado['muertos'] = [], golpes: Resultado['golpes'] = [];
  const llegadas: Record<string, number | null> = Object.fromEntries(js.map((j) => [j.id, null]));
  const fotogramas: Fotograma[] = [];
  const marcas: Celda[][] = config.tandas.map(() => []);
  let destapada: number | null = null;

  /** Cuándo sale de la parada `idx` quien llega en el segundo `t` (null: se queda) */
  const salidaDe = (j: JugadorPlan, idx: number, t: number): number | null => {
    const s = j.ruta[idx].salida, ultima = idx === j.ruta.length - 1;
    if (s === 'pasar') return ultima ? null : t;
    if (typeof s === 'object') return ultima ? null : Math.max(t, s.t);
    const tanda = config.tandas.find((x) => tick(x.aviso) >= tick(t));
    if (!tanda) return null;
    return Math.max(tanda.aviso + DT, tanda.impacto - config.margen - config.holgura - 0.5 / v);
  };
  /** Adónde va quien sale de su última parada tras esperar el rayo */
  const refugio = (j: JugadorPlan): Punto => {
    if (j.ruta.length > 1) return centro(j.ruta[j.ruta.length - 2].celda);
    const c = j.ruta[0].celda, m = (n - 1) / 2;
    const df = Math.sign(m - c.f), dk = Math.sign(m - c.k);
    return centro(Math.abs(m - c.f) >= Math.abs(m - c.k) ? { f: c.f + (df || 1), k: c.k } : { f: c.f, k: c.k + (dk || 1) });
  };

  const est: Estado[] = js.map((j) => {
    const pos = centro(j.ruta[0].celda);
    return { pos, idx: 0, fase: 'esperando', salir: salidaDe(j, 0, 0), objetivo: pos, vivo: true, aSegura: false, refugio: false, golpeado: new Set() };
  });
  const golpe = (i: number, t: number, causa: Causa, efecto: Efecto) => {
    const muere = efecto === 'muerte';
    eventos.push({ t, tipo: 'golpe', jugador: js[i].id, causa, muere });
    if (muere) { est[i].vivo = false; muertos.push({ jugador: js[i].id, t, causa }); }
    else golpes.push({ jugador: js[i].id, t, causa });
  };

  const fin = tick(config.final);
  for (let it = 0; it <= fin; it++) {
    const t = Math.round(it * DT * 1000) / 1000;
    // 1. Movimiento (de t − DT a t) y decisiones
    for (let i = 0; i < js.length; i++) {
      const e = est[i], j = js[i];
      if (!e.vivo) continue;
      if (segura && destapada !== null && !e.aSegura && tick(t) >= tick(destapada + config.reaccion)) {
        e.aSegura = true; e.fase = 'yendo'; e.objetivo = centro(segura);
      }
      if (e.fase === 'esperando' && e.salir !== null && tick(e.salir) <= it) {
        if (e.idx < j.ruta.length - 1) { e.idx++; e.objetivo = centro(j.ruta[e.idx].celda); }
        else { e.objetivo = refugio(j); e.refugio = true; }
        e.fase = 'yendo';
      }
      if (e.fase === 'yendo' && it > 0) {
        const d = dist(e.pos, e.objetivo), paso = v * DT;
        if (d <= paso + 1e-9) {
          e.pos = e.objetivo;
          if (e.aSegura) { e.fase = 'quieto'; llegadas[j.id] = t; }
          else if (e.refugio) e.fase = 'quieto';
          else { e.fase = 'esperando'; e.salir = salidaDe(j, e.idx, t); }
        } else {
          e.pos = { x: e.pos.x + ((e.objetivo.x - e.pos.x) / d) * paso, y: e.pos.y + ((e.objetivo.y - e.pos.y) / d) * paso };
        }
      }
    }
    // 2. Tandas de rayos: marca, ventana de daño e impacto
    config.tandas.forEach((tanda, nt) => {
      if (tick(tanda.aviso) === it) {
        const porCelda = new Map<string, { celda: Celda; jugadores: string[] }>();
        est.forEach((e, i) => {
          if (!e.vivo) return;
          const c = celdaDe(e.pos, n), clave = `${c.f},${c.k}`;
          if (!porCelda.has(clave)) porCelda.set(clave, { celda: c, jugadores: [] });
          porCelda.get(clave)!.jugadores.push(js[i].id);
        });
        for (const { celda, jugadores } of porCelda.values()) {
          marcas[nt].push(celda);
          eventos.push({ t, tipo: 'marca', tanda: nt, celda, jugadores });
        }
      }
      if (it >= tick(tanda.impacto - config.margen) && it <= tick(tanda.impacto) && marcas[nt].length) {
        est.forEach((e, i) => {
          if (!e.vivo || e.golpeado.has(nt)) return;
          const c = celdaDe(e.pos, n);
          if (misma(c, segura) || !marcas[nt].some((m) => misma(m, c))) return;
          e.golpeado.add(nt);
          golpe(i, t, 'rayo', config.alFallar === 'muere' ? 'muerte' : 'golpe');
        });
      }
      if (tick(tanda.impacto) === it) {
        for (const celda of marcas[nt]) {
          const esSegura = misma(celda, segura);
          eventos.push({ t, tipo: 'impacto', tanda: nt, celda, segura: esSegura });
          if (esSegura && destapada === null) { destapada = t; eventos.push({ t, tipo: 'destapada', celda }); }
        }
      }
    });
    // 3. Orbes y rayo de esquina
    for (const o of config.orbes) {
      if (tick(o.impacto) !== it) continue;
      est.forEach((e, i) => { if (e.vivo && dist(e.pos, o) <= o.radio) golpe(i, t, 'orbe', o.efecto); });
    }
    const re = config.rayoEsquina;
    if (re && tick(re.impacto) === it) {
      const a = puntoEsquina(escenario.esquina, n), b = puntoEsquina(opuesta(escenario.esquina), n);
      est.forEach((e, i) => { if (e.vivo && distSegmento(e.pos, a, b) <= re.ancho / 2) golpe(i, t, 'rayo-esquina', re.efecto); });
    }
    // 4. Golpe final
    if (it === fin) {
      est.forEach((e, i) => { if (e.vivo && !misma(celdaDe(e.pos, n), segura)) golpe(i, t, 'final', 'muerte'); });
    }
    if (opciones.fotogramas !== false) fotogramas.push({ t, pos: est.map((e) => ({ ...e.pos })), vivo: est.map((e) => e.vivo) });
  }

  return { escenario, eventos, muertos, golpes, destapada, llegadas, exito: muertos.length === 0, fotogramas };
}

export type PruebaCasilla = {
  celda: Celda;
  /** Simulaciones (una por esquina posible del rayo) y cuántas acaban sin muertos */
  total: number; exitos: number;
  /** Segundo en que se destapa (null: nadie la destapa) */
  destapada: number | null;
  /** Muertes sumadas en todas sus simulaciones, por causa */
  muertes: Partial<Record<Causa, number>>;
};
export type PruebaTodas = { casillas: PruebaCasilla[]; total: number; exitos: number; sinDestapar: number };

/** El plan contra cada casilla segura posible (y cada esquina del rayo si es al azar). */
export function probarTodas(config: Config, plan: Plan): PruebaTodas {
  const n = config.tamano;
  const esquinas: Esquina[] = !config.rayoEsquina ? [1] : config.rayoEsquina.esquina === 'azar' ? [1, 2, 3, 4] : [config.rayoEsquina.esquina];
  const casillas: PruebaCasilla[] = [];
  for (let f = 0; f < n; f++) {
    for (let k = 0; k < n; k++) {
      const celda = { f, k }, muertes: PruebaCasilla['muertes'] = {};
      let exitos = 0, destapada: number | null = null;
      for (const esquina of esquinas) {
        const r = simular(config, plan, { segura: celda, esquina }, { fotogramas: false });
        if (r.exito) exitos++;
        if (r.destapada !== null) destapada = destapada === null ? r.destapada : Math.min(destapada, r.destapada);
        for (const m of r.muertos) muertes[m.causa] = (muertes[m.causa] ?? 0) + 1;
      }
      casillas.push({ celda, total: esquinas.length, exitos, destapada, muertes });
    }
  }
  return {
    casillas,
    total: casillas.reduce((s, c) => s + c.total, 0),
    exitos: casillas.reduce((s, c) => s + c.exitos, 0),
    sinDestapar: casillas.filter((c) => c.destapada === null).length,
  };
}

export type Cobertura = {
  /** Primera tanda en que se marca cada casilla (null: ninguna) por filas */
  tanda: (number | null)[][];
  huecos: Celda[];
};

/** Qué casillas destapa el plan si nadie encuentra la segura (antes de destaparla, el plan no depende de dónde esté). */
export function cobertura(config: Config, plan: Plan): Cobertura {
  const esquina = config.rayoEsquina && config.rayoEsquina.esquina !== 'azar' ? config.rayoEsquina.esquina : 1;
  const r = simular(config, plan, { segura: null, esquina }, { fotogramas: false });
  const n = config.tamano, tanda: (number | null)[][] = Array.from({ length: n }, () => Array<number | null>(n).fill(null));
  for (const e of r.eventos) if (e.tipo === 'impacto' && tanda[e.celda.f][e.celda.k] === null) tanda[e.celda.f][e.celda.k] = e.tanda;
  const huecos: Celda[] = [];
  tanda.forEach((fila, f) => fila.forEach((x, k) => { if (x === null) huecos.push({ f, k }); }));
  return { tanda, huecos };
}
