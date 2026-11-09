// Lo que se le manda a la IA para analizar una raid y lo que se le exige de vuelta. Puro (sin red ni base): se prueba
// en tests/unit/analisis-ia.test.ts. Las reglas son las de «Analiza la última raid» de CLAUDE.md.
import { esquemaAnalisis, type Analisis } from '@/lib/ingest/analisis';

type Datos = Record<string, unknown> & {
  meta: { jefe: string; fecha: string; grupo: string[]; [k: string]: unknown };
  curva?: unknown; casteos?: { intento: number; t: number; habilidad: string }[];
  dps_intento?: { intento: number; jugador: string; dps: number; muertes: number }[];
};
export type Nombres = { apodos: Record<string, string>; habilidades: Record<string, string>; npcs: Record<string, string> };
export type Historial = { fecha: string; intentos: number; mejor_pct: number | null; matado: boolean; muertes: number | null; dps_grupo_medio: number | null }[];

const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** La raid compacta: sin la curva de vida (los intentos ya traen su progreso) y con los casteos del jefe agrupados. */
export function resumenParaIA(d: Datos, nombres: Nombres, historial: Historial) {
  const { curva: _curva, casteos, dps_intento, ...resto } = d;
  void _curva;
  const porHab = new Map<string, { t: number[]; intentos: Set<number> }>();
  for (const c of casteos ?? []) {
    const p = porHab.get(c.habilidad) ?? { t: [], intentos: new Set<number>() };
    p.t.push(c.t); p.intentos.add(c.intento); porHab.set(c.habilidad, p);
  }
  const casteosJefe = [...porHab].map(([habilidad, p]) => ({
    habilidad, veces: p.t.length, intentos: p.intentos.size, primero_s: Math.round(Math.min(...p.t)), mediana_s: Math.round(mediana(p.t)),
  })).sort((a, b) => a.mediana_s - b.mediana_s);
  // dps y muertes de cada jugador por intento: { jugador: [[dps, muertes], …] } en el orden de los intentos
  const porJugador: Record<string, [number, number][]> = {};
  for (const x of [...(dps_intento ?? [])].sort((a, b) => a.intento - b.intento)) (porJugador[x.jugador] ??= []).push([x.dps, x.muertes]);

  const raid = { ...resto, casteos_jefe: casteosJefe, dps_y_muertes_por_intento: porJugador };
  // Diccionario de nombres para cada id que aparece (apodo > nombre de habilidad > nombre de npc)
  const ids = new Set<string>();
  const recorrer = (v: unknown, clave = ''): void => {
    if (Array.isArray(v)) v.forEach((x) => recorrer(x, clave));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) recorrer(x, k);
    else if (typeof v === 'string' && /^\d{4,9}$/.test(v) && /habilidad|causa|origen/.test(clave)) ids.add(v);
  };
  recorrer(raid);
  const dic: Record<string, string> = {};
  for (const id of [...ids].sort()) { const n = nombres.apodos[id] ?? nombres.habilidades[id] ?? nombres.npcs[id]; if (n) dic[id] = n; }
  return { raid, nombres: dic, raids_anteriores_del_mismo_jefe: historial };
}

const EJEMPLO = {
  pendiente: false,
  titular: 'Una o dos frases con la conclusión de la noche; se permite **negrita**.',
  zonas: { muro: [35, 50], ventana: [140, 175] },
  recomendaciones: [{ titulo: 'Imperativo corto.', texto: 'Por qué, con la evidencia de los datos (cifras, intentos, ids como 1803396).' }],
  jugadores: { NombreDelJugador: ['Recomendación personal respaldada por sus cifras.'] },
  notas: [{ termino: 'Etiqueta', texto: 'Matiz o advertencia sobre esta raid.' }],
};

export const PROMPT_SISTEMA = `Eres analista de raids de Aion 2 para la web DPS Aion. Recibes en json las estadísticas de una noche de raid de un grupo (sacadas del medidor de combate de Questlog) y devuelves SOLO un objeto json con el análisis en español.

Qué mirar:
- Progreso por intento (intentos.progreso_pct, que es el % de vida que le quitaron al jefe) y dónde se atascan los intentos.
- Qué mata a la gente: causas (muertes por habilidad y origen); un golpe_max >= 100000 es un golpe que mata de una vez (one-shot).
- La secuencia de casteos del jefe (casteos_jefe: veces, intentos en que sale, segundo mediano) y las roturas de aturdimiento (intentos.rotura_s).
- Las cifras de cada jugador (jugadores) y su detalle: habilidades (daño por habilidad), recibido, muertes (con vida_5s y vida_1s = % de vida 5 s y 1 s antes de morir, dano_5s y cura_5s), apoyo (curación y escudos por habilidad y por objetivo), supervivencia (bajo30_pct = % del tiempo por debajo del 30 % de vida, resurrecciones, golpes mitigados y evitados) y rotacion (usos_min = habilidades por minuto vivo, pausas_pct = tiempo sin usar nada, primer_golpe_s, usos por habilidad, buffs al grupo).
- dps_y_muertes_por_intento: [dps, muertes] de cada jugador en cada intento.
- raids_anteriores_del_mismo_jefe: compara con ellas si hay (tendencia del mejor %, muertes, dps del grupo).

Reglas:
- Los hechos salen SOLO de los datos. Si algo es una deducción (por ejemplo, que alguien se fue a mitad de la raid), dilo como deducción.
- Escribe los ids de habilidades y npcs como números sueltos (por ejemplo 1803396), también en los títulos: la web los sustituye por su nombre. El diccionario «nombres» es para que entiendas qué es cada id; no escribas el nombre en su lugar.
- Da a CADA jugador de raid.meta.grupo al menos una recomendación en «jugadores» (la clave es su nombre exacto), basada en sus propios datos (muertes y sus causas, dps frente al grupo y a su clase, reparto de habilidades, daño recibido, curación o apoyo si es sanador o tanque), constructiva y concreta. No incluyas a nadie que no esté en raid.meta.grupo.
- No asumas el género de nadie: usa su nombre o formas neutras.
- Entre 3 y 7 recomendaciones para el grupo, ordenadas por impacto. Titular de una o dos frases.
- «zonas» es opcional: muro = [desde, hasta] en % de vida del jefe donde se atascan; ventana = [desde, hasta] en segundos del intento.
- Cifras al estilo español: coma decimal y «k» para miles (4,8k DPS; 37 %).
- Sin texto fuera del json, sin markdown salvo **negrita** dentro de los textos.

Formato exacto (json):
${JSON.stringify(EJEMPLO, null, 2)}`;

export const PROMPT_TRADUCIR = `Traduce al inglés este análisis de una raid de Aion 2 y devuelve SOLO un objeto json con exactamente la misma estructura: mismas claves, mismos nombres de jugadores como claves, mismo número de elementos en cada lista, mismos ids (números sueltos como 1803396) y mismas cifras, pero en formato inglés (4.8k DPS; 37%). Traduce solo los textos; conserva la **negrita**. No asumas el género de nadie (usa they/them o el nombre). Responde en json.`;

/** Valida un análisis de la IA: formato de la web y un consejo para cada jugador del grupo. Devuelve los problemas. */
export function revisarAnalisis(x: unknown, grupo: string[], referencia?: Analisis): { analisis?: Analisis; problemas: string[] } {
  const v = esquemaAnalisis.safeParse(x);
  if (!v.success) return { problemas: v.error.issues.slice(0, 15).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) };
  const a = v.data, problemas: string[] = [];
  if (a.pendiente) problemas.push('pendiente debe ser false');
  if (!a.titular.trim()) problemas.push('falta el titular');
  if (!a.recomendaciones.length) problemas.push('faltan recomendaciones para el grupo');
  const jug = a.jugadores ?? {};
  for (const n of grupo) if (!jug[n]?.some((t) => t.trim())) problemas.push(`falta al menos una recomendación para ${n}`);
  for (const n of Object.keys(jug)) if (!grupo.includes(n)) problemas.push(`${n} no está en meta.grupo`);
  if (referencia) {
    if (a.recomendaciones.length !== referencia.recomendaciones.length) problemas.push('la traducción no tiene el mismo número de recomendaciones');
    for (const [n, l] of Object.entries(referencia.jugadores ?? {})) if ((jug[n]?.length ?? 0) !== l.length) problemas.push(`la traducción de ${n} no tiene los mismos consejos`);
    if ((a.notas?.length ?? 0) !== (referencia.notas?.length ?? 0)) problemas.push('la traducción no tiene las mismas notas');
  }
  return problemas.length ? { problemas } : { analisis: a, problemas };
}

/** Nota que se añade al final para que se sepa que el texto es automático. */
export const NOTA_IA = {
  es: { termino: 'Análisis automático', texto: 'Generado por IA (DeepSeek) a partir de los datos de la raid. Puede contener errores: las cifras de las gráficas y tablas son las que mandan.' },
  en: { termino: 'Automatic analysis', texto: 'Generated by AI (DeepSeek) from the raid data. It may contain mistakes: the figures in the charts and tables are what count.' },
} as const;
