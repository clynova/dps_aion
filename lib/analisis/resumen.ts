// Lo que se le manda a la IA para analizar una raid y lo que se le exige de vuelta. Puro (sin red ni base): se prueba
// en tests/unit/analisis-ia.test.ts. Las reglas son las de «Analiza la última raid» de CLAUDE.md.
import { esquemaAnalisis, type Analisis } from '@/lib/ingest/analisis';
import { analizarBuffs, buffsParaIA, type BuffDato } from '@/lib/raids/buffs';
import { analizarEspecializaciones, especializacionesParaIA, type EspecializacionDato } from '@/lib/raids/especializaciones';
import { compararIntentos, intentosParaIA, type IntentoDato, type PuntoCurva } from '@/lib/raids/intentos';
import { analizarMecanicas, fallosParaIA, type MecanicaDato } from '@/lib/raids/mecanicas';
import { analizarRepaso, repasoParaIA, type MuerteDato } from '@/lib/raids/repaso';
import { analizarVentanas, ventanasParaIA, type VentanasDato } from '@/lib/raids/ventanas';
import { idsEnTexto, type seguimientoParaIA } from '@/lib/raids/seguimiento';
import { guiaParaIA } from '@/lib/guia/contenido';

export type SeguimientoIA = ReturnType<typeof seguimientoParaIA>;

type Datos = Record<string, unknown> & {
  meta: { jefe: string; fecha: string; grupo: string[]; [k: string]: unknown };
  curva?: unknown; casteos?: { intento: number; t: number; habilidad: string }[];
  dps_intento?: { intento: number; jugador: string; dps: number; muertes: number }[];
};
export type Nombres = { apodos: Record<string, string>; habilidades: Record<string, string>; npcs: Record<string, string> };
export type Historial = { fecha: string; intentos: number; mejor_pct: number | null; matado: boolean; muertes: number | null; dps_grupo_medio: number | null }[];

const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** La raid compacta: sin la curva de vida (los intentos ya traen su progreso) y con los casteos del jefe agrupados. */
export function resumenParaIA(d: Datos, nombres: Nombres, historial: Historial, seguimiento?: SeguimientoIA) {
  // La guía de la web para este jefe (contenido/raids): sus mecánicas, para que los consejos usen los mismos nombres
  const guia = guiaParaIA(Number(d.meta.npc));
  const { curva, casteos, dps_intento, mecanicas, ventanas: ventanasCrudas, especializaciones: espCrudas, buffs_recibidos: buffsCrudos, ...resto } = d;
  // Las mecánicas no van en crudo (40 ataques × 10 jugadores): solo lo que destaca, ya comparado (lib/raids/mecanicas.ts)
  const det = (d.detalle ?? {}) as Record<string, { muertes?: { habilidad: string }[] }>;
  const fallos = Array.isArray(mecanicas) && mecanicas.length ? fallosParaIA(analizarMecanicas(
    mecanicas as MecanicaDato[], d.meta.grupo, (d.causas ?? []) as { habilidad: string; muertes: number }[],
    Object.fromEntries(Object.entries(det).map(([n, x]) => [n, x.muertes ?? []])),
  )) : null;
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

  // El repaso de cada muerte (sus 10 s anteriores) tampoco va en crudo: se quita de cada muerte y se mandan las cuentas
  // ya hechas (lib/raids/repaso.ts)
  const rep = analizarRepaso(Object.fromEntries(Object.entries(det).map(([n, x]) => [n, (x.muertes ?? []) as MuerteDato[]])), d.meta.grupo);
  const repaso = rep.conRepaso ? repasoParaIA(rep) : null;
  const detalle = Object.fromEntries(Object.entries(det).map(([n, x]) => [n, x.muertes
    ? { ...x, muertes: x.muertes.map((m) => { const { repaso: _r, ...sin } = m as MuerteDato; void _r; return sin; }) } : x]));

  // Las ventanas de daño, igual: ya comparadas (lib/raids/ventanas.ts)
  const ven = ventanasCrudas ? ventanasParaIA(analizarVentanas(ventanasCrudas as VentanasDato, d.meta.grupo)) : null;
  const ventanas = ven && (ven.roturas_de_barra || ven.debuffs_sobre_el_jefe.length) ? ven : null;

  // Cada intento frente al kill o al mejor intento, a igual progreso (lib/raids/intentos.ts): sale de la curva, que
  // por eso no hace falta mandar en crudo
  const cmp = Array.isArray(d.intentos) && Array.isArray(curva) ? compararIntentos(d.intentos as IntentoDato[], curva as PuntoCurva[],
    Object.fromEntries(Object.entries(det).map(([n, x]) => [n, (x.muertes ?? []) as { intento: number; t: number; habilidad: string }[]])), d.meta.grupo) : null;
  const comparacion = cmp && cmp.cuentas.comparables ? intentosParaIA(cmp) : null;

  // Especializaciones y buffs recibidos: solo lo que se aparta (lib/raids/especializaciones.ts y buffs.ts)
  const esp = Array.isArray(espCrudas) ? especializacionesParaIA(analizarEspecializaciones(espCrudas as EspecializacionDato[],
    (d.jugadores ?? []) as { jugador: string; clase_id: string }[], d.meta.grupo)) : [];
  const buf = Array.isArray(buffsCrudos) ? buffsParaIA(analizarBuffs(buffsCrudos as BuffDato[], d.meta.grupo)) : [];

  const raid = { ...resto, ...(d.detalle ? { detalle } : {}), casteos_jefe: casteosJefe, dps_y_muertes_por_intento: porJugador };
  // Diccionario de nombres para cada id que aparece (apodo > nombre de habilidad > nombre de npc)
  const ids = new Set<string>();
  for (const x of fallos?.ataques ?? []) ids.add(x.habilidad);
  for (const x of repaso?.primera_muerte_de_cada_intento ?? []) if (x.habilidad) ids.add(x.habilidad);
  for (const x of ventanas?.debuffs_sobre_el_jefe ?? []) ids.add(x.habilidad);
  for (const x of esp) ids.add(x.habilidad);
  for (const x of buf) ids.add(x.buff);
  for (const x of comparacion?.por_intento ?? []) {
    for (const y of x.murieron_antes_que_en_la_referencia) if (y.habilidad) ids.add(y.habilidad);
    if (x.ataque_que_mas_mata_de_mas) ids.add(x.ataque_que_mas_mata_de_mas.habilidad);
    if (x.despues_del_ultimo_hito_comun?.habilidad) ids.add(x.despues_del_ultimo_hito_comun.habilidad);
  }
  for (const r of seguimiento?.recomendaciones_anteriores ?? []) for (const id of idsEnTexto(r.titulo)) ids.add(id);
  const recorrer = (v: unknown, clave = ''): void => {
    if (Array.isArray(v)) v.forEach((x) => recorrer(x, clave));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) recorrer(x, k);
    else if (typeof v === 'string' && /^\d{4,9}$/.test(v) && /habilidad|causa|origen/.test(clave)) ids.add(v);
  };
  recorrer(raid);
  const dic: Record<string, string> = {};
  for (const id of [...ids].sort()) { const n = nombres.apodos[id] ?? nombres.habilidades[id] ?? nombres.npcs[id]; if (n) dic[id] = n; }
  return {
    raid, nombres: dic, clasificaciones: clasificaciones(d as { jugadores?: unknown; detalle?: unknown; intentos?: unknown }),
    ...(fallos ? { fallos_de_mecanica: fallos } : {}),
    ...(repaso ? { repaso_de_muertes: repaso } : {}),
    ...(ventanas ? { ventanas_de_dano: ventanas } : {}),
    ...(comparacion ? { comparacion_con_el_mejor_intento: comparacion } : {}),
    ...(esp.length ? { especializaciones_distintas_de_su_clase: esp } : {}),
    ...(buf.length ? { buffs_que_recibe_de_menos: buf } : {}),
    raids_anteriores_del_mismo_jefe: historial,
    ...(guia ? { guia_del_jefe: guia } : {}),
    ...(seguimiento ? { seguimiento_de_la_raid_anterior: seguimiento } : {}),
  };
}

/**
 * Clasificaciones ya calculadas (de mayor a menor) para que la IA no se equivoque al comparar a 10 jugadores
 * («el que más daño recibe», «el que más muere»): en la primera prueba real fallaba justo en eso.
 */
export function clasificaciones(d: { jugadores?: unknown; detalle?: unknown; intentos?: unknown }) {
  const jug = (d.jugadores ?? []) as { jugador: string; dps?: number; hps?: number; dano_recibido?: number; muertes?: number }[];
  const det = (d.detalle ?? {}) as Record<string, { apoyo?: { curacion?: number }; rotacion?: { vivo_s?: number }; supervivencia?: { resurrecciones?: number } }>;
  const orden = (f: (n: string) => number | undefined): [string, number][] =>
    jug.map((j) => [j.jugador, f(j.jugador)] as [string, number | undefined]).filter((x): x is [string, number] => typeof x[1] === 'number').sort((a, b) => b[1] - a[1]);
  const de = (n: string) => jug.find((j) => j.jugador === n);
  return {
    dps: orden((n) => de(n)?.dps),
    curacion: orden((n) => det[n]?.apoyo?.curacion),
    dano_recibido: orden((n) => de(n)?.dano_recibido),
    muertes: orden((n) => de(n)?.muertes),
    resurrecciones: orden((n) => det[n]?.supervivencia?.resurrecciones),
    segundos_vivo: orden((n) => det[n]?.rotacion?.vivo_s),
    // intentos: [número de intento, valor]
    intentos_por_dps_grupo: porIntento(d.intentos, 'dps_grupo'),
    intentos_por_progreso: porIntento(d.intentos, 'progreso_pct'),
  };
}

const porIntento = (xs: unknown, campo: string): [number, number][] => ((xs ?? []) as Record<string, number>[])
  .filter((i) => typeof i[campo] === 'number').map((i) => [i.intento, i[campo]] as [number, number]).sort((a, b) => b[1] - a[1]);

/**
 * Quita el nombre que la IA a veces pone entre paréntesis detrás de un id («13080000 (Postura de evasión)»): la web
 * ya sustituye el id por su nombre y saldría repetido. Solo paréntesis sin cifras (los de valores, como «(219650)», se quedan).
 */
export function quitarNombresTrasIds<T>(a: T): T {
  // y la negrita alrededor de un id suelto (la web ya lo destaca al poner el nombre), aunque el prompt la prohíbe
  const limpiar = (s: string) => s.replace(/\b(\d{7,8})(\*\*)?\s*\(([^()\d]{1,60})\)/g, '$1$2').replace(/\*\*(\d{7,8})\*\*/g, '$1');
  const recorrer = (v: unknown): unknown => (typeof v === 'string' ? limpiar(v) : Array.isArray(v) ? v.map(recorrer)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recorrer(x)])) : v);
  return recorrer(a) as T;
}

/** Ids que salen en la raid (habilidades, causas, npcs): el resto de números largos de un texto son cifras. */
export function idsDeLaRaid(d: unknown): Set<string> {
  const ids = new Set<string>();
  const recorrer = (v: unknown, clave = ''): void => {
    if (Array.isArray(v)) v.forEach((x) => recorrer(x, clave));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) recorrer(x, k);
    else if ((typeof v === 'string' || typeof v === 'number') && /habilidad|causa|origen|npc/.test(clave) && /^\d{4,9}$/.test(String(v))) ids.add(String(v));
  };
  recorrer(d);
  return ids;
}

/**
 * Da formato a las cifras que la IA deja en crudo («2456997» → «2,46 M», «504604» → «504,6k»; en inglés con punto),
 * sin tocar los ids de la raid, que la web sustituye por su nombre. Solo números de 5 cifras o más sin decimales.
 */
export function formatearCifras<T>(a: T, idioma: 'es' | 'en', ids: Set<string>): T {
  const dec = (x: number, d: number) => (idioma === 'es' ? x.toFixed(d).replace('.', ',') : x.toFixed(d)).replace(/[.,]0+$/, '');
  const f = (n: number) => (n >= 1e6 ? `${dec(n / 1e6, 2)}${idioma === 'es' ? ' M' : 'M'}` : `${dec(n / 1e3, 1)}k`);
  const limpiar = (s: string) => s.replace(/(?<![\d.,])\d{5,9}(?![\d.,]\d)/g, (m) => (ids.has(m) ? m : f(Number(m))));
  const recorrer = (v: unknown): unknown => (typeof v === 'string' ? limpiar(v) : Array.isArray(v) ? v.map(recorrer)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recorrer(x)])) : v);
  return recorrer(a) as T;
}

/** Nombres de campos del json («rotura_s», «vida_1s») que se cuelan en el texto; los nombres de jugador no cuentan. */
export function camposEnTexto(textos: string[], grupo: string[]): string[] {
  return [...new Set(textos.join(' ').match(/\b[a-z]+_[a-z0-9_]+\b/g) ?? [])].filter((x) => !grupo.includes(x));
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
- La secuencia de casteos del jefe (casteos_jefe: veces, intentos en que sale, segundo mediano).
- intentos.rotura_s = segundo del intento en que el grupo ROMPIÓ la barra de aturdimiento (stagger) del jefe. Romperla es BUENO: el jefe queda aturdido y recibe más daño. null = no se llegó a romper en ese intento (a menudo porque el grupo murió antes de llegar a ese momento).
- Un intento corto NO es mejor: si dura poco es porque el grupo murió antes. El avance real es progreso_pct.
- Las cifras de cada jugador (jugadores) y su detalle: habilidades (daño por habilidad), recibido, muertes (con vida_5s y vida_1s = % de vida 5 s y 1 s antes de morir, dano_5s y cura_5s), apoyo (curación y escudos por habilidad y por objetivo), supervivencia (bajo30_pct = % del tiempo por debajo del 30 % de vida, resurrecciones, golpes mitigados y evitados) y rotacion (usos_min = habilidades por minuto vivo, pausas_pct = tiempo sin usar nada, primer_golpe_s, usos por habilidad, buffs al grupo).
- dps_y_muertes_por_intento: [dps, muertes] de cada jugador en cada intento.
- raids_anteriores_del_mismo_jefe: compara con ellas si hay (tendencia del mejor %, muertes, dps del grupo).
- fallos_de_mecanica (si viene): de los ataques del jefe que NO dan a todo el grupo, cuántas veces le dieron a cada jugador y cuántas le habrían dado al ritmo de sus compañeros. por_jugador va de quien más recibe de más a quien menos (diferencia_pct = % sobre lo esperado; ataques_donde_recibe_de_mas son ids); en ataques, de_mas lista «Jugador veces/salidas». Es una DEDUCCIÓN (el registro no dice qué ataques se pueden esquivar, y quien tanquea o pelea cuerpo a cuerpo está más expuesto): dilo como tal («recibe 13 de 22, el doble que el resto: probablemente se puede evitar»). Úsalo en los consejos personales de quien destaque; no acuses al objetivo fijo de un ataque (tipo «objetivo fijo»).
- repaso_de_muertes (si viene): cada muerte clasificada por sus 10 s anteriores. de_un_golpe = un solo golpe se lo llevó, con la vida al 80 % o más o con un golpe que quita el 80 % de su vida máxima (es de mecánica: no lo arregla la curación); en_rafaga = estaba bien 3 s antes y cayó con varios golpes seguidos; por_desgaste = llevaba 3 s o más con la vida baja (ahí sí cuenta la curación). sin_sanador_vivo y con_el_grupo_caido (más de la mitad de sus compañeros ya muertos) son muertes que arrastra un intento ya perdido: no las cargues a quien muere. con_defensivo_sin_usar = murió en ráfaga o por desgaste con un escudo propio que probablemente tenía disponible. primera_muerte_de_cada_intento dice quién abre cada cadena de muertes y con qué. Es una DEDUCCIÓN con umbrales fijos: dilo como tal. Úsalo para decir si el problema del grupo es de mecánica o de aguante, y en el consejo personal de quien destaque.
- ventanas_de_dano (si viene): el daño de cada jugador mientras la barra del jefe está rota (el jefe aturdido recibe más daño: es el momento de gastar lo fuerte) frente al resto de esos intentos, por segundo vivo. multiplicador = cuánto sube su dps en la rotura; compáralo con el del grupo (frente_al_grupo ya lo dice cuando destaca). roturas_vivo = en cuántas roturas estaba vivo al empezar: quien llega muerto pierde la ventana. Es normal que quien cura o tanquea suba menos: no se lo reproches. debuffs_sobre_el_jefe = % del tiempo que cada jugador mantiene cada efecto sobre el jefe, en total y durante la rotura. Úsalo en una recomendación al grupo si se pierde daño en la rotura y en el consejo personal de quien destaque, por arriba o por abajo.
- comparacion_con_el_mejor_intento (si viene): cada intento frente al kill o, sin kill, al intento que más lejos llegó (referencia), comparados A IGUAL PROGRESO: en cada 5 % de vida del jefe que alcanzaron los dos, segundos que tardaron y muertes que llevaban. se_separa_al_pct = primer hito en que el intento iba claramente peor (3 muertes más, o un 15 % y 10 s más lento) y por qué; si es null, iba como la referencia hasta ese hito y cayó después (despues_del_ultimo_hito_comun dice qué pasó). murieron_antes_que_en_la_referencia = quién había muerto ya en ese punto y en la referencia no; ataque_que_mas_mata_de_mas = el ataque que más muertes de más causa hasta ahí. resumen cuenta cuántos intentos se pierden por muertes y cuántos por ritmo: úsalo para decir qué tuvo el mejor intento que no tuvieron los demás (por ejemplo, «el mejor llegó al 15 % sin muertes; los demás llevaban 3»). jugadores_que_caen_antes_que_en_la_referencia sirve para los consejos personales, pero quien cae primero puede ser el objetivo de una mecánica. Es una comparación con umbrales fijos: dilo como deducción.
- especializaciones_distintas_de_su_clase (si viene): habilidades en que un jugador eligió opciones de especialización distintas de las de los demás de su clase en esta raid (las opciones son números, en el orden del juego; deducidos del id del casteo). NO sabes qué opción es mejor ni cuánto daño da cada una: no digas que una es peor ni le atribuyas dps. Como mucho, menciónalo en su consejo personal como algo a comparar con los demás de su clase, citando las opciones de cada uno.
- buffs_que_recibe_de_menos (si viene): jugadores que tienen un buff de un compañero bastante menos tiempo (vivo) que los demás que lo reciben. Probablemente se quedan fuera de su alcance: por ejemplo, el sanador principal que va detrás del tanque, lejos del grupo. Es una DEDUCCIÓN: dilo así. Tenlo en cuenta antes de reprocharle a ese jugador un dps bajo, y en una recomendación de posición (que quien da el buff lo lance cerca de él, o que se acerque al grupo cuando el tanque no necesite curación).
- seguimiento_de_la_raid_anterior (si viene): qué pasó con las recomendaciones de la raid anterior de este jefe: cifras de antes y de ahora del grupo, de los ataques que nombraban y de cada jugador. Di en el titular o en una recomendación qué mejoró y qué sigue igual, con esas cifras; no repitas un consejo ya cumplido.
- guia_del_jefe (si viene): las mecánicas de este jefe según la guía de la web: titulo, que_hacer, hace_wipe, sus ataques (ids) y en_datos (visto = confirmado en registros de la versión actual; probable = deducción; sin_ver = solo lo dicen guías de la versión anterior y puede haber cambiado). Si una recomendación trata de una de estas mecánicas, llámala por su título y apóyate en su que_hacer; no presentes como seguro lo que está sin_ver. Los hechos de esta raid siguen saliendo de sus datos, no de la guía.
- clasificaciones: listas ya ordenadas de mayor a menor (dps, curacion, dano_recibido, muertes, resurrecciones, segundos_vivo; e intentos_por_dps_grupo e intentos_por_progreso, como [intento, valor]). Para decir que alguien es «el que más» o «el que menos» de algo, o su puesto, mira SIEMPRE estas listas; no lo deduzcas tú.

Reglas:
- Los hechos salen SOLO de los datos. Si algo es una deducción (por ejemplo, que alguien se fue a mitad de la raid), dilo como deducción.
- Escribe los ids de habilidades y npcs como números sueltos (por ejemplo 1803396), también en los títulos: la web los sustituye por su nombre. El diccionario «nombres» es para que entiendas qué es cada id: no escribas el nombre en su lugar NI junto al id (nada de «13080000 (Postura de evasión)» ni de «impacto letal de la zona 9-2 (1803204)»: saldría repetido). Escribe solo el número: «evita 1803204».
- Da a CADA jugador de raid.meta.grupo al menos una recomendación en «jugadores» (la clave es su nombre exacto), basada en sus propios datos (muertes y sus causas, dps frente al grupo y a su clase, reparto de habilidades, daño recibido, curación o apoyo si es sanador o tanque), constructiva y concreta. No incluyas a nadie que no esté en raid.meta.grupo.
- En los consejos de un jugador, nombra SOLO habilidades suyas: las que salen en SU detalle (habilidades, apoyo, rotacion.usos_hab, rotacion.buffs). No le recomiendes habilidades por id que no use: si crees que le falta una defensa, dilo sin id («guarda una defensiva para…»). Las habilidades del jefe (las de causas, casteos_jefe y recibido) sí se pueden citar.
- Háblale a cada jugador de tú, en español neutro (nada de vosotros: «tienes», «usa», no «tenéis», «usad»). Las recomendaciones al grupo, en impersonal o en primera persona del plural («conviene…», «hay que…», «guardemos…»).
- No asumas el género de nadie: usa su nombre o formas neutras.
- Entre 3 y 7 recomendaciones para el grupo, ordenadas por impacto. Titular de una o dos frases.
- «zonas» es opcional: muro = [desde, hasta] en % de vida del jefe donde se atascan; ventana = [desde, hasta] en segundos del intento.
- Cifras al estilo español: coma decimal y «k» para miles (4,8k DPS; 37 %).
- Sin texto fuera del json, sin markdown salvo **negrita** dentro de los textos, y con moderación: solo para la cifra o la idea clave de cada texto. Nunca pongas un id en negrita.

Formato exacto (json):
${JSON.stringify(EJEMPLO, null, 2)}`;

// En inglés: escrito en español, en la primera prueba real DeepSeek devolvió el mismo texto sin traducir
export const PROMPT_TRADUCIR = `You are a translator. The user message is a json object with a Spanish analysis of an Aion 2 raid. Translate EVERY text value into natural English (titular, every recomendaciones titulo and texto, every string in jugadores, every notas termino and texto) and return ONLY a json object with exactly the same structure: the same keys (keep the Spanish key names such as "titular" and "recomendaciones"), the same player names as keys, the same number of items in every list, the same ids (bare numbers such as 1803396) and the same figures in English format (4.8k DPS; 37%). Keep **bold** where it is. Address each player as "you". Do not assume anyone's gender (use their name or they/them). The output text must be in English, not Spanish. Reply in json.`;

// Palabras muy frecuentes de cada idioma, para detectar una «traducción» que sigue en español
const PALABRAS_ES = /\b(el|la|los|las|de|del|que|y|en|por|con|para|una|un|es|se|tu|no)\b/gi;
const PALABRAS_EN = /\b(the|of|and|to|in|is|you|your|for|with|on|at|that|it|are|this)\b/gi;
export function pareceEspanol(textos: string[]): boolean {
  const t = textos.join(' ');
  return (t.match(PALABRAS_ES)?.length ?? 0) > (t.match(PALABRAS_EN)?.length ?? 0);
}
/**
 * Formas de «vosotros» (la web tutea): presente/subjuntivo en -áis/-éis («tenéis», «sacrifiquéis») e imperativos en
 * -ad/-ed/-id al empezar una frase («Reservad», «Romped», «Cubrid»), sin contar sustantivos como «Mitad» o «Salud».
 */
export function formasVosotros(textos: string[]): string[] {
  const t = textos.join('\n');
  const presente = t.match(/\b[a-záéíóúñ]{3,}(áis|éis)\b/gi) ?? [];
  const imperativo = [...t.matchAll(/(?:^|[.:;!?¡¿\n]\s*)([A-ZÁÉÍÓÚ][a-záéíóúñ]{2,}(?:ad|ed|id))\b/g)].map((m) => m[1]).filter((p) => !/(dad|tad|tud)$/i.test(p));
  return [...new Set([...presente, ...imperativo])];
}

const textosDe = (a: Analisis) => [a.titular, ...a.recomendaciones.flatMap((r) => [r.titulo, r.texto]), ...Object.values(a.jugadores ?? {}).flat(), ...(a.notas ?? []).flatMap((n) => [n.termino, n.texto])];

/** Ids de habilidades de cada jugador: todo lo que sale en su detalle (habilidades, recibido, apoyo, rotación…). */
export function habilidadesPorJugador(d: { detalle?: Record<string, unknown>; ventanas?: unknown; especializaciones?: unknown }): Record<string, Set<string>> {
  const res: Record<string, Set<string>> = {};
  // las que castea con especialización (especializaciones)
  for (const x of (d.especializaciones as { jugador: string; habilidad: string }[] | undefined) ?? []) (res[x.jugador] ??= new Set<string>()).add(x.habilidad);
  // y los debuffs que mantiene sobre el jefe (ventanas.debuffs)
  for (const x of (d.ventanas as { debuffs?: { jugador: string; habilidad: string }[] } | undefined)?.debuffs ?? []) (res[x.jugador] ??= new Set<string>()).add(x.habilidad);
  for (const [n, det] of Object.entries(d.detalle ?? {})) {
    const s = (res[n] ??= new Set<string>());
    const recorrer = (v: unknown, clave = ''): void => {
      if (Array.isArray(v)) v.forEach((x) => recorrer(x, clave));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) recorrer(x, k);
      else if ((typeof v === 'string' || typeof v === 'number') && clave === 'habilidad') s.add(String(v));
    };
    recorrer(det);
  }
  return res;
}

// Habilidades de jugador: ids de 8 cifras entre 11000000 y 19999999 (las de npc tienen 7)
const ID_HAB_JUGADOR = /\b1[1-9]\d{6}\b/g;

/**
 * Valida un análisis de la IA: formato de la web, un consejo para cada jugador del grupo y, si se pasan sus
 * habilidades, que los consejos de cada uno no citen habilidades de jugador que no usa. Devuelve los problemas.
 */
export function revisarAnalisis(x: unknown, grupo: string[], referencia?: Analisis, habilidades?: Record<string, Set<string>>): { analisis?: Analisis; problemas: string[] } {
  const v = esquemaAnalisis.safeParse(x);
  if (!v.success) return { problemas: v.error.issues.slice(0, 15).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) };
  const a = v.data, problemas: string[] = [];
  if (a.pendiente) problemas.push('pendiente debe ser false');
  if (!a.titular.trim()) problemas.push('falta el titular');
  if (!a.recomendaciones.length) problemas.push('faltan recomendaciones para el grupo');
  const jug = a.jugadores ?? {};
  for (const n of grupo) if (!jug[n]?.some((t) => t.trim())) problemas.push(`falta al menos una recomendación para ${n}`);
  for (const n of Object.keys(jug)) if (!grupo.includes(n)) problemas.push(`${n} no está en meta.grupo`);
  if (habilidades) {
    for (const [n, consejos] of Object.entries(jug)) {
      const ajenas = [...new Set(consejos.join(' ').match(ID_HAB_JUGADOR) ?? [])].filter((id) => !habilidades[n]?.has(id));
      if (ajenas.length) problemas.push(`los consejos de ${n} citan habilidades que no usa en esta raid (${ajenas.join(', ')}): quítalas o di el consejo sin id`);
    }
  }
  const entreParentesis = textosDe(a).join(' ').match(/\(\s*(\*\*)?\d{7,8}(\*\*)?\s*\)/g) ?? [];
  if (entreParentesis.length) problemas.push(`no pongas el nombre de una habilidad y su id entre paréntesis (${entreParentesis.slice(0, 4).join(', ')}): escribe solo el id, sin nombre ni paréntesis; la web pone el nombre`);
  const campos = camposEnTexto(textosDe(a), grupo);
  if (campos.length) problemas.push(`no escribas nombres de campos del json (${campos.slice(0, 6).join(', ')}): dilo con palabras («no se rompió la barra», «con la vida al 100 % un segundo antes»)`);
  if (!referencia) {
    const vos = formasVosotros(textosDe(a));
    if (vos.length) problemas.push(`no uses vosotros (${vos.slice(0, 6).join(', ')}): a cada jugador háblale de tú y al grupo en impersonal o en primera persona del plural («conviene…», «hay que…», «guardemos…»)`);
  }
  if (referencia) {
    if (a.recomendaciones.length !== referencia.recomendaciones.length) problemas.push('la traducción no tiene el mismo número de recomendaciones');
    for (const [n, l] of Object.entries(referencia.jugadores ?? {})) if ((jug[n]?.length ?? 0) !== l.length) problemas.push(`la traducción de ${n} no tiene los mismos consejos`);
    if ((a.notas?.length ?? 0) !== (referencia.notas?.length ?? 0)) problemas.push('la traducción no tiene las mismas notas');
    if (pareceEspanol(textosDe(a))) problemas.push('the texts are still in Spanish: translate every text value into English');
  }
  return problemas.length ? { problemas } : { analisis: a, problemas };
}

/** Nota que se añade al final para que se sepa que el texto es automático. */
export const NOTA_IA = {
  es: { termino: 'Análisis automático', texto: 'Generado por IA (DeepSeek) a partir de los datos de la raid. Puede contener errores: las cifras de las gráficas y tablas son las que mandan.' },
  en: { termino: 'Automatic analysis', texto: 'Generated by AI (DeepSeek) from the raid data. It may contain mistakes: the figures in the charts and tables are what count.' },
} as const;
