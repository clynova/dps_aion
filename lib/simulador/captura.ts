// Jugadores desde una captura de la party (fase 3 del simulador de Ludra, docs/plan-simulador-ludra.md). Puro: el OCR
// (tesseract.js) y el canvas van en el componente; aquí, preparar la imagen para el OCR y sacar los nombres del texto.
//
// - `binarizar`: texto claro sobre fondo oscuro (ventana de party del juego, barras de Questlog) → texto negro sobre
//   blanco, con umbral adaptativo (media de la zona, método de Bradley): las barras de color de Questlog y las de vida
//   del juego tienen luminancias muy distintas y un umbral fijo se come unas u otras. `engrosar` ensancha el trazo (la
//   letra del juego es fina y con mucho espacio entre letras).
// - `extraerJugadores`: del texto de una o varias pasadas de OCR, los nombres. Probado con capturas reales (18/11/2026):
//   ninguna pasada sola los lee todos, y los errores típicos son el corchete leído como «l» («nombrelAZP]»), el
//   servidor mal leído («AZF», «1SR»), letras separadas («Sir Mesa») y nombres cortos irreconocibles («xT2» → «XL»).
//   Seguros: «nombre[SRV]» (party del juego, jugadores de otro servidor), «nombre SRV» (Questlog) y los que coinciden
//   con un jugador conocido (de las raids públicas del jefe). Probables: la última palabra de una línea corta (en el
//   juego, los del mismo servidor salen sin [SRV]). Lo demás no se propone. La pantalla deja corregirlos a mano.

export type Conocido = { nombre: string; clase: string };
export type Candidato = {
  /** Lo que leyó el OCR */
  leido: string;
  /** El nombre que se usará: el del jugador conocido si coincide; si no, lo leído limpio */
  nombre: string;
  clase: string | null;
  /** Coincide con un jugador conocido */
  conocido: boolean;
  /** Seguro que es un nombre (servidor al lado o conocido); si no, probable */
  seguro: boolean;
  /** En cuántas pasadas del OCR salió (los de verdad suelen salir en varias; la basura, en una) */
  veces: number;
};

/** Texto de la interfaz que no es un nombre (normalizado) */
const NO_NOMBRES = [
  'party', 'random', 'grupo', 'group', 'listo', 'nolisto', 'ready', 'notready', 'lider', 'leader', 'resumen', 'summary',
  'questlog', 'questloggg', 'medio', 'grup', 'raid', 'alianza', 'alliance', 'legion', 'average', 'gs', 'pc', 'cp', 'no',
].map((s) => normalizar(s));

/** Para comparar nombres leídos por OCR: minúsculas, sin tildes ni espacios y con las letras que el OCR confunde igualadas */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[|!1ij]/g, 'l').replace(/0/g, 'o').replace(/5/g, 's').replace(/[^a-z0-9]/g, '');
}

export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

/** El jugador conocido que corresponde a lo leído: igual tras normalizar o con 1 letra de diferencia (2 si el nombre
 *  tiene 7 o más). Un nombre de 3 letras o menos solo admite 1 si lo leído es seguro (llevaba servidor). */
export function buscarConocido(leido: string, conocidos: Conocido[], seguro = false): Conocido | null {
  const n = normalizar(leido);
  if (n.length < 2) return null;
  let mejor: Conocido | null = null, dmin = Infinity;
  for (const c of conocidos) {
    const m = normalizar(c.nombre), largo = Math.max(n.length, m.length);
    const tope = largo >= 7 ? 2 : largo >= 4 || seguro ? 1 : 0;
    const d = distancia(n, m);
    if (d <= tope && d < dmin) { dmin = d; mejor = c; }
  }
  return mejor;
}

const esRuido = (nombre: string) => {
  const n = normalizar(nombre);
  return n.length < 3 || /^\d/.test(nombre) || NO_NOMBRES.some((x) => distancia(n, x) <= (x.length >= 5 ? 1 : 0));
};
const parecidos = (a: string, b: string) => (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b)) || (Math.min(a.length, b.length) >= 5 && distancia(a, b) <= 1);
const PALABRA = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*$/;
const limpiar = (s: string) => s.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').trim();

/** Nombres con servidor en una línea: «Nombre[SRV]», «NombrelSRV]», «Nombre SRV]», «Nombre [SRV]» */
function conServidor(linea: string): { leido: string; palabras: string[]; servidor: string }[] {
  const r: { leido: string; palabras: string[]; servidor: string }[] = [];
  for (const trozo of linea.replace(/[[({]/g, '[').replace(/[\])}]/g, ']').split(']').slice(0, -1)) {
    const m = trozo.match(/^(.*?)(?:\s*\[\s*|\s+|(?<=[a-z0-9])[lI1|])([A-Za-z0-9]{2,4})\s*$/);
    if (!m) continue;
    const palabras = limpiar(m[1].replace(/\[/g, ' ')).split(/\s+/).filter((p) => PALABRA.test(p));
    if (palabras.length) r.push({ leido: m[0].trim(), palabras, servidor: m[2] });
  }
  return r;
}

/**
 * Los jugadores que salen en los textos del OCR (una o varias pasadas), en el orden en que aparecen y sin repetir.
 * `conocidos`: jugadores con su clase para corregir lo leído.
 */
export function extraerJugadores(textos: string | string[], conocidos: Conocido[]): Candidato[] {
  const r: (Candidato & { pasadas: Set<number> })[] = [];
  const servidores = new Set<string>();
  let pasada = 0;
  const anadir = (leido: string, palabras: string[], seguro: boolean) => {
    // Nombre de dos trozos («Sir Mesa», «QR Z», «rum baa») si juntos son un conocido o el último es muy corto
    const ultimo = palabras[palabras.length - 1], dos = palabras.length > 1 ? palabras[palabras.length - 2] + ultimo : null;
    const c2 = dos ? buscarConocido(dos, conocidos, seguro) : null;
    const nombreLeido = c2 || (dos && ultimo.length <= 2) ? dos! : ultimo;
    const c = c2 ?? buscarConocido(nombreLeido, conocidos, seguro);
    if (!c && esRuido(nombreLeido)) return;
    const nombre = c?.nombre ?? nombreLeido, clave = normalizar(nombre);
    const ya = r.find((x) => normalizar(x.nombre) === clave);
    if (ya) { ya.seguro ||= seguro; ya.pasadas.add(pasada); return; }
    r.push({ leido, nombre, clase: c?.clase ?? null, conocido: !!c, seguro: seguro || !!c, veces: 0, pasadas: new Set([pasada]) });
  };
  for (const texto of Array.isArray(textos) ? textos : [textos]) {
    pasada++;
    for (const linea of texto.split(/\r?\n/)) {
      const conSrv = conServidor(linea);
      for (const x of conSrv) { servidores.add(normalizar(x.servidor)); anadir(x.leido, x.palabras, true); }
      const resto = linea.replace(/[^\]]*\]/g, ' ');
      const palabras = limpiar(resto).split(/\s+/).filter(Boolean);
      for (let i = 0; i < palabras.length; i++) {
        const p = palabras[i], sig = palabras[i + 1];
        if (!PALABRA.test(p)) continue;
        // «Nombre SRV» (Questlog): la palabra siguiente es corta y parece un servidor (AZP, azp, Sie, 1sr…), salvo
        // que las dos juntas sean un conocido (un nombre partido por el OCR)
        if (sig && /^[A-Za-z1][A-Za-z]{1,3}$/.test(sig) && !PALABRA.test(palabras[i + 2] ?? '') && !esRuido(p)) {
          const partido = !!buscarConocido(p + sig, conocidos);
          if (!partido) servidores.add(normalizar(sig));
          anadir(`${p} ${sig}`, partido ? [p, sig] : [p], true); i++; continue;
        }
        const conocido = buscarConocido(p, conocidos);
        if (conocido) { anadir(p, [p], true); continue; }
        // Probable: última palabra de una línea corta sin servidores («W Kel», «208 rumbaa»)
        if (!conSrv.length && i === palabras.length - 1 && palabras.length <= 3) anadir(p, [p], false);
      }
    }
  }
  for (const x of r) x.veces = x.pasadas.size;
  // Un código de servidor leído suelto («AZP») no es un jugador
  for (const x of r) if (!x.conocido && servidores.has(normalizar(x.nombre))) x.pasadas.clear();
  for (let i = r.length - 1; i >= 0; i--) if (!r[i].pasadas.size) r.splice(i, 1);
  // Variantes del mismo nombre sin conocido («Lorca»/«Lorcan», «Praderal»/«Pradera», «Mesa»/«SirMesa»): se queda la
  // que sale en más pasadas (a igualdad, la más larga) y suma las pasadas de la otra
  const fuera = new Set<Candidato>();
  for (const a of r) {
    for (const b of r) {
      if (a === b || fuera.has(a) || fuera.has(b) || a.conocido || !parecidos(normalizar(a.nombre), normalizar(b.nombre))) continue;
      const pierde = b.conocido || b.veces > a.veces || (b.veces === a.veces && b.nombre.length > a.nombre.length) ? a : b;
      const gana = pierde === a ? b : a;
      for (const p of pierde.pasadas) gana.pasadas.add(p);
      gana.veces = gana.pasadas.size; gana.seguro ||= pierde.seguro;
      fuera.add(pierde);
    }
  }
  return r.filter((x) => !fuera.has(x)).map((x) => ({ leido: x.leido, nombre: x.nombre, clase: x.clase, conocido: x.conocido, seguro: x.seguro, veces: x.veces }));
}

/** Los que conviene marcar de entrada, hasta `tope`: los conocidos, los seguros que salen en más de una pasada (o en
 *  la única) y los probables que salen en todas. */
export function preseleccion(cs: Candidato[], pasadas: number, tope = 10): boolean[] {
  let n = 0;
  return cs.map((c) => {
    const si = n < tope && (c.conocido || (c.seguro && (c.veces >= 2 || pasadas === 1)) || c.veces >= pasadas);
    if (si) n++;
    return si;
  });
}

/**
 * Texto claro sobre fondo oscuro → texto negro sobre blanco (RGBA, en el sitio). Umbral adaptativo de Bradley: un píxel
 * es texto si su luminancia supera en un `t` la media de su zona (`ventana` px de lado) y un mínimo absoluto.
 */
export function binarizar(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, ventana = Math.max(15, Math.round(w / 12)), t = 0.25, minimo = 110): void {
  const lum = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  // Imagen integral para la media de cada zona
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += lum[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + fila;
    }
  }
  const r = Math.floor(ventana / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r), y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      const suma = integral[(y1 + 1) * (w + 1) + x1 + 1] - integral[y0 * (w + 1) + x1 + 1] - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const l = lum[y * w + x], texto = l > minimo && l > (suma / n) * (1 + t);
      const v = texto ? 0 : 255, i = (y * w + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
}

/** Peso del filtro bicúbico de Keys (a = −0,5) */
function cubico(x: number): number {
  const a = -0.5, t = Math.abs(x);
  if (t <= 1) return (a + 2) * t ** 3 - (a + 3) * t ** 2 + 1;
  if (t < 2) return a * t ** 3 - 5 * a * t ** 2 + 8 * a * t - 4 * a;
  return 0;
}

/** Amplía un canal (luminancia) con interpolación bicúbica, en dos pasos (horizontal y vertical). */
export function ampliar(canal: Float32Array, w: number, h: number, escala: number): { canal: Float32Array; w: number; h: number } {
  const W = Math.max(1, Math.round(w * escala)), H = Math.max(1, Math.round(h * escala));
  const pesos = (n: number, N: number) => Array.from({ length: N }, (_, i) => {
    const x = (i + 0.5) * (n / N) - 0.5, x0 = Math.floor(x);
    return [-1, 0, 1, 2].map((d) => [Math.min(n - 1, Math.max(0, x0 + d)), cubico(x - (x0 + d))] as const);
  });
  const px = pesos(w, W), py = pesos(h, H);
  const tmp = new Float32Array(W * h);
  for (let y = 0; y < h; y++) for (let X = 0; X < W; X++) {
    let s = 0;
    for (const [x, p] of px[X]) s += canal[y * w + x] * p;
    tmp[y * W + X] = s;
  }
  const r = new Float32Array(W * H);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    let s = 0;
    for (const [y, p] of py[Y]) s += tmp[y * W + X] * p;
    r[Y * W + X] = Math.min(255, Math.max(0, s));
  }
  return { canal: r, w: W, h: H };
}

/**
 * La imagen lista para el OCR: luminancia, ampliada `escala` veces (bicúbica: con la bilineal del canvas el OCR no lee
 * la letra fina del juego), binarizada y, si `gordo`, con el trazo engrosado. Devuelve RGBA.
 */
export function prepararImagen(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, escala: number, gordo: boolean): { rgba: Uint8ClampedArray<ArrayBuffer>; w: number; h: number } {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  const g = ampliar(lum, w, h, escala);
  const r = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0; i < g.w * g.h; i++) { r[i * 4] = r[i * 4 + 1] = r[i * 4 + 2] = g.canal[i]; r[i * 4 + 3] = 255; }
  binarizar(r, g.w, g.h);
  if (gordo) engrosar(r, g.w, g.h);
  return { rgba: r, w: g.w, h: g.h };
}

/** Ensancha 1 px hacia la derecha el trazo negro de una imagen ya binarizada (RGBA, en el sitio). */
export function engrosar(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): void {
  const negro = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) negro[i] = rgba[i * 4] === 0 ? 1 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w; x++) {
      if (!negro[y * w + x - 1]) continue;
      const i = (y * w + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
    }
  }
}

/** Las pasadas de OCR que se combinan: escala, si se engrosa y modo de página de Tesseract (3 = automático,
 *  11 = texto suelto). Con las capturas de prueba, cada una pierde nombres distintos y juntas los leen todos. */
export const PASADAS: { escala: number; gordo: boolean; psm: '3' | '11' }[] = [
  { escala: 3, gordo: false, psm: '3' },
  { escala: 3, gordo: true, psm: '11' },
  { escala: 4, gordo: false, psm: '11' },
];
