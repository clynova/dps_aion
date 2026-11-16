// La pestaña «Sin filtro» (docs/plan-toxico.md): lo que se le manda a la IA, el prompt y lo que se le exige de vuelta.
// Puro (sin red ni base): se prueba en tests/unit/toxico.test.ts. La llamada y el guardado están en ia.ts.
import type { Analisis } from '@/lib/ingest/analisis';
import { esquemaToxico, type Toxico } from '@/lib/ingest/toxico';
import { camposEnTexto, formasVosotros, ID_HAB_JUGADOR, pareceEspanol, resumenParaIA, type Historial, type Nombres, type SeguimientoIA } from './resumen';

export type Nivel = 'alto' | 'medio' | 'bajo';
export const PULLAS_MAX: Record<Nivel, number> = { alto: 4, medio: 2, bajo: 1 };

/**
 * Cuánto se le puede echar en cara a cada jugador, con cifras fijas para que la proporción no dependa de la IA (en la
 * primera prueba real todos se llevaban tres pullas): muertes + 1,5 por cada intento en que muere el primero, frente
 * a la mediana del grupo. Un 25 % o más por encima es «alto» (hasta 4 pullas); un 25 % o más por debajo, o sin
 * muertes, «bajo» (1); el resto, «medio» (2).
 */
export function nivelesDeCulpa(d: { meta: { grupo: string[] }; jugadores?: unknown; detalle?: unknown; intentos?: unknown }) {
  const jug = (d.jugadores ?? []) as { jugador: string; clase?: string; muertes?: number }[];
  const det = (d.detalle ?? {}) as Record<string, { muertes?: { intento: number; t: number; habilidad?: string }[] }>;
  // Los pulls fallidos (menos del 1 % de vida quitada: reinicios, muertes en el segundo 0 sin habilidad) no cuentan:
  // en la primera prueba real la IA culpaba de «abrir el intento» a quien moría así
  const falsos = new Set(((d.intentos ?? []) as { intento: number; progreso_pct?: number }[]).filter((i) => (i.progreso_pct ?? 0) < 1).map((i) => i.intento));
  const muertesDe = (n: string) => (det[n]?.muertes ?? []).filter((m) => !falsos.has(m.intento));
  // Quién cae primero en cada intento (con la habilidad que lo mató: sin ella no se sabe qué pasó)
  const primero = new Map<number, { n: string; t: number }>();
  for (const n of Object.keys(det)) for (const m of muertesDe(n)) {
    if (!m.habilidad) continue;
    const p = primero.get(m.intento);
    if (!p || m.t < p.t) primero.set(m.intento, { n, t: m.t });
  }
  const abre = (n: string) => [...primero.values()].filter((p) => p.n === n).length;
  const filas = d.meta.grupo.map((n) => {
    const j = jug.find((x) => x.jugador === n);
    // Sin detalle (raids antiguas), las muertes de la tabla
    const muertes = det[n] ? muertesDe(n).length : j?.muertes ?? 0, a = abre(n);
    return { jugador: n, clase: j?.clase ?? null, muertes, abre_intentos: a, puntos: muertes + 1.5 * a };
  }).sort((x, y) => y.puntos - x.puntos);
  // Frente a lo normal de esa noche (la mediana): en una raid en que medio grupo muere 4 veces, 4 muertes es «medio»
  const p = filas.map((f) => f.puntos).sort((a, b) => a - b), m = p.length >> 1;
  const mediana = p.length ? (p.length % 2 ? p[m] : (p[m - 1] + p[m]) / 2) : 0;
  return filas.map((f) => {
    const nivel: Nivel = f.puntos === 0 || f.puntos <= mediana * 0.75 ? 'bajo' : f.puntos > mediana && f.puntos >= mediana * 1.25 ? 'alto' : 'medio';
    const { puntos: _p, ...resto } = f; void _p;
    return { ...resto, nivel, pullas_max: PULLAS_MAX[nivel] };
  });
}

/** Lo mismo que recibe el análisis principal, ese análisis (lo tóxico no puede contradecirlo) y el nivel de culpa. */
export function entradaToxico(datos: Parameters<typeof resumenParaIA>[0], nombres: Nombres, historial: Historial, principal: Analisis, seguimiento?: SeguimientoIA) {
  const { notas, ...resto } = principal;
  const r = resumenParaIA(datos, nombres, historial, seguimiento);
  // Los debuffs sobre el jefe fuera: en la primera prueba eran la mitad de las pullas y los leía al revés
  const ventanas = r.ventanas_de_dano ? { ...r.ventanas_de_dano, debuffs_sobre_el_jefe: [] } : undefined;
  // Y quién abre cada intento, sin los pulls fallidos ni las muertes sin habilidad (las mismas reglas que nivelesDeCulpa)
  const falsos = new Set(((datos.intentos ?? []) as { intento: number; progreso_pct?: number }[]).filter((i) => (i.progreso_pct ?? 0) < 1).map((i) => i.intento));
  const repaso = r.repaso_de_muertes ? { ...r.repaso_de_muertes,
    primera_muerte_de_cada_intento: r.repaso_de_muertes.primera_muerte_de_cada_intento.filter((m) => m.habilidad && !falsos.has(m.intento)) } : undefined;
  return {
    ...r, ...(ventanas ? { ventanas_de_dano: ventanas } : {}), ...(repaso ? { repaso_de_muertes: repaso } : {}),
    nivel_de_culpa: nivelesDeCulpa(datos as Parameters<typeof nivelesDeCulpa>[0]),
    // La nota «Análisis automático» no le sirve a la IA
    analisis_principal: { ...resto, notas: (notas ?? []).filter((n) => !/autom[aá]tico/i.test(n.termino)) },
  };
}

/**
 * Frases de 5 palabras que se repiten en las pullas de 3 jugadores o más («que no es tan complicado», «la próxima raid
 * no admite otra excusa»): en la primera prueba real las muletillas se comían la gracia. Sin contar cifras ni ids.
 */
export function muletillas(a: Toxico, permitidas = ''): string[] {
  const cuenta = new Map<string, number>();
  for (const j of Object.values(a.jugadores)) {
    const palabras = soloPalabras([...j.pullas, j.mejora].join(' ')).split(' ').filter(Boolean);
    const vistas = new Set<string>();
    for (let i = 0; i + 5 <= palabras.length; i++) vistas.add(palabras.slice(i, i + 5).join(' '));
    for (const v of vistas) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  }
  // Las que ya vienen en lo que recibe la IA (nombres de mecánicas de la guía, apodos, el análisis principal) no cuentan
  const ya = soloPalabras(permitidas);
  return [...cuenta].filter(([v, n]) => n >= 3 && !ya.includes(v)).map(([v]) => v);
}
const soloPalabras = (s: string) => ` ${s.toLowerCase().split(/[^a-záéíóúüñ]+/).filter(Boolean).join(' ')} `;

const EJEMPLO: Toxico = {
  titular: 'Una o dos frases demoledoras sobre la noche, con la cifra que más duele; se permite **negrita**.',
  jugadores: {
    NombreDelJugador: {
      pullas: ['Una pulla cruel apoyada en una cifra suya (muertes, dps frente a su clase, golpes que el resto esquiva…).'],
      mejora: 'Cómo dejar de hacerlo: una mejora concreta, también con su cifra.',
    },
  },
};

export const PROMPT_TOXICO = `Eres el crítico más cruel de raids de Aion 2 para la pestaña «Sin filtro» de la web DPS Aion. Recibes en json las estadísticas de una noche de raid (las mismas que el analista principal) y, en analisis_principal, el análisis serio que ya se publicó. Devuelves SOLO un objeto json, en español, que cuenta únicamente lo MALO de cada jugador, sin suavizarlo, y cómo dejar de hacerlo.

Tono:
- Cruel, sarcástico y con mala leche, como un compañero de raid harto de hacer wipes por culpa de los demás. Ironía, comparaciones con mala uva y humor negro sobre la jugada. Empieza cada jugador por lo PEOR que tiene.
- Nada de elogios ni de consuelo: ni «buen trabajo», ni «no está mal», ni «al menos», ni «es el que más daño hace, pero…». Si lo bueno de alguien sirve para hundirlo («de qué sirve ser el que más pega si te pasas la raid en el suelo»), vale; si no, no lo menciones.
- Proporcional, según nivel_de_culpa (calculado con sus muertes en los intentos de verdad y los intentos en que muere el primero): «alto» = hasta 4 pullas, las más duras; «medio» = hasta 2; «bajo» = UNA sola pulla corta y al siguiente (lo poco que se le pueda echar en cara, o que hoy se libra por poco). No pases de pullas_max.
- Cada pulla, distinta: no repitas la misma frase, chiste ni estructura con varios jugadores (nada de muletillas como «que no es tan complicado» o «la próxima raid no admite otra excusa»). Cada mejora, también distinta y concreta.
- Se critica la JUGADA, nunca a la persona: nada sobre físico, inteligencia, edad, familia, origen, género o cualquier rasgo personal; nada de insultos ni groserías. Duele porque la cifra no deja escapatoria, no por las palabras.

Verdad ante todo:
- Cada pulla sale de una cifra de los datos de ESE jugador (muertes y sus causas, primera muerte de cada intento, dps frente al grupo y a su clase, daño recibido, golpes que el resto esquiva, defensivo sin usar al morir, daño en la rotura, tiempo por debajo del 30 % de vida, curación si es sanador). Si no está en los datos, no lo digas.
- No contradigas analisis_principal: si allí algo es una deducción (fallos de mecánica, buffs fuera de alcance, especializaciones), aquí también lo es («probablemente», «todo apunta a»).
- No culpes a nadie de lo que no es culpa suya: el objetivo fijo de un ataque (el tanque que recibe el golpe al tanque), quien muere sin sanador vivo o con medio grupo ya caído, el sanador que tiene menos buffs porque está lejos del grupo, el dps más bajo de quien cura o tanquea. Las especializaciones distintas NO son peores: no las uses para atacar.
- Para decir que alguien es «el que más» o «el que menos» de algo, mira SIEMPRE clasificaciones.
- El rol de cada jugador sale SOLO de su clase (jugadores.clase: Templario = tanque; Clérigo = sanador; Cantor = apoyo y curación; el resto, daño). No inventes roles ni posiciones («cuando no tanquees», «detrás del tanque») que no salgan de ahí o de los datos.
- supervivencia.resurrecciones = veces que A ESE JUGADOR lo resucitaron (no las que resucitó él).
- Los intentos que quitan menos del 1 % de vida al jefe son pulls fallidos o reinicios, y una muerte sin habilidad no se sabe qué la causó: no uses ninguna de las dos para burlarte de nadie (ni para decir que abrió un intento).
- Los golpes de un solo golpe (de_un_golpe) son de mecánica: búrlate de que se los coma, no de que no se cure.

Reglas de formato (las mismas que el análisis principal):
- Escribe los ids de habilidades y npcs como números sueltos (por ejemplo 1803396); la web los sustituye por su nombre. Nunca el nombre junto al id ni el id en negrita.
- En las pullas de un jugador nombra SOLO habilidades suyas (las de SU detalle) o del jefe (causas, casteos_jefe, recibido).
- Háblale a cada jugador de tú, en español neutro (nada de vosotros). El titular, en impersonal o en primera persona del plural.
- No asumas el género de nadie: usa su nombre o formas neutras.
- Da una entrada en «jugadores» a CADA jugador de raid.meta.grupo (la clave es su nombre exacto) y a nadie más, con «pullas» (de 1 a 4 frases cortas) y «mejora» (una frase: qué hacer en la próxima raid, concreta).
- Cifras al estilo español: coma decimal y «k» para miles (4,8k DPS; 37 %). Sin nombres de campos del json en el texto.
- Sin texto fuera del json; sin markdown salvo **negrita** con moderación.

Formato exacto (json):
${JSON.stringify(EJEMPLO, null, 2)}`;

export const PROMPT_TRADUCIR_TOXICO = `You are a translator. The user message is a json object with a deliberately harsh, sarcastic Spanish roast of the players of an Aion 2 raid. Translate EVERY text value into natural English (titular, every pullas item and mejora of every player, every notas termino and texto), keeping the same cruel, sarcastic tone, and return ONLY a json object with exactly the same structure: the same keys (keep "titular", "jugadores", "pullas", "mejora"), the same player names as keys, the same number of items in every list, the same ids (bare numbers such as 1803396) and the same figures in English format (4.8k DPS; 37%). Keep **bold** where it is. Address each player as "you". Do not assume anyone's gender. The output must be in English, not Spanish. Reply in json.`;

/** Todos los textos del análisis tóxico, para las comprobaciones. */
export const textosToxico = (a: Toxico) => [a.titular, ...Object.values(a.jugadores).flatMap((j) => [...j.pullas, j.mejora]), ...(a.notas ?? []).flatMap((n) => [n.termino, n.texto])];

/**
 * Valida el json de la IA: formato, una entrada por jugador del grupo y nadie más, habilidades que el jugador no usa,
 * nombres de campos, vosotros y, en la traducción, la misma estructura y que no siga en español.
 */
/** `permitidas`: el texto de la entrada, cuyas frases no cuentan como muletillas; `null` = no mirar las muletillas. */
export function revisarToxico(x: unknown, grupo: string[], referencia?: Toxico, habilidades?: Record<string, Set<string>>, maximos?: Record<string, number>, permitidas: string | null = ''): { toxico?: Toxico; problemas: string[] } {
  const v = esquemaToxico.safeParse(x);
  if (!v.success) return { problemas: v.error.issues.slice(0, 15).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) };
  const a = v.data, problemas: string[] = [];
  if (!a.titular.trim()) problemas.push('falta el titular');
  if (maximos && !referencia) {
    for (const [n, j] of Object.entries(a.jugadores)) if (maximos[n] !== undefined && j.pullas.length > maximos[n]) problemas.push(`${n} tiene ${j.pullas.length} pullas y su pullas_max es ${maximos[n]}: deja solo las ${maximos[n]} más duras`);
  }
  for (const n of grupo) if (!a.jugadores[n]?.pullas.some((p) => p.trim()) || !a.jugadores[n]?.mejora.trim()) problemas.push(`falta ${n} (con al menos una pulla y su mejora)`);
  for (const n of Object.keys(a.jugadores)) if (!grupo.includes(n)) problemas.push(`${n} no está en meta.grupo`);
  if (habilidades) {
    for (const [n, j] of Object.entries(a.jugadores)) {
      const ajenas = [...new Set([...j.pullas, j.mejora].join(' ').match(ID_HAB_JUGADOR) ?? [])].filter((id) => !habilidades[n]?.has(id));
      if (ajenas.length) problemas.push(`las pullas de ${n} citan habilidades que no usa en esta raid (${ajenas.join(', ')}): quítalas o dilo sin id`);
    }
  }
  const entreParentesis = textosToxico(a).join(' ').match(/\(\s*(\*\*)?\d{7,8}(\*\*)?\s*\)/g) ?? [];
  if (entreParentesis.length) problemas.push(`no pongas el id entre paréntesis (${entreParentesis.slice(0, 4).join(', ')}): escribe solo el id`);
  const campos = camposEnTexto(textosToxico(a), grupo);
  if (campos.length) problemas.push(`no escribas nombres de campos del json (${campos.slice(0, 6).join(', ')}): dilo con palabras`);
  if (!referencia) {
    const vos = formasVosotros(textosToxico(a));
    if (vos.length) problemas.push(`no uses vosotros (${vos.slice(0, 6).join(', ')}): a cada jugador háblale de tú y el titular en impersonal o en primera persona del plural`);
    const rep = permitidas === null ? [] : muletillas(a, permitidas);
    if (rep.length) problemas.push(`repites frases con varios jugadores (${rep.slice(0, 4).map((r) => `«${r}»`).join(', ')}): cada pulla y cada mejora tiene que ser distinta`);
  } else {
    for (const [n, j] of Object.entries(referencia.jugadores)) if (a.jugadores[n]?.pullas.length !== j.pullas.length) problemas.push(`la traducción de ${n} no tiene las mismas pullas`);
    if ((a.notas?.length ?? 0) !== (referencia.notas?.length ?? 0)) problemas.push('la traducción no tiene las mismas notas');
    if (pareceEspanol(textosToxico(a))) problemas.push('the texts are still in Spanish: translate every text value into English');
  }
  return problemas.length ? { problemas } : { toxico: a, problemas };
}

/** Nota del final: que se sepa que es automático y a propósito. */
export const NOTA_TOXICO = {
  es: { termino: 'Sin filtro', texto: 'Generado por IA (DeepSeek) a partir de los datos de la raid y del análisis principal, con el tono cruel a propósito. Critica la jugada, no a la persona; puede equivocarse, y las cifras de las gráficas y tablas son las que mandan.' },
  en: { termino: 'No filter', texto: 'Generated by AI (DeepSeek) from the raid data and the main analysis, deliberately harsh. It criticises the play, not the person; it can be wrong, and the figures in the charts and tables are what count.' },
} as const;
