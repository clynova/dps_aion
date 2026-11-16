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

const TANQUES = new Set(['templar']), SANADORES = new Set(['cleric', 'chanter']);
const med = (xs: number[]) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const r1 = (x: number) => Math.round(x * 10) / 10;
/** Cifra al estilo español (coma decimal), para que la IA no la copie con punto */
const es1 = (x: number) => String(r1(x)).replace('.', ',');

export type Hecho = { tema: string; texto: string; peso: number };
type ResumenIA = ReturnType<typeof resumenParaIA>;

/**
 * La munición de cada jugador: sus peores cifras frente al grupo o a su clase, ya comparadas y en frases sueltas, de
 * más a menos grave (hasta 5). En la primera versión la IA recibía solo los datos en bruto y acababa listando ataques
 * («tus 3 muertes son de un golpe: A, B y C») con la misma frase para todos. Puro; los umbrales son fijos.
 */
export function materialToxico(d: Parameters<typeof resumenParaIA>[0], r: Pick<ResumenIA, 'fallos_de_mecanica' | 'repaso_de_muertes' | 'ventanas_de_dano' | 'buffs_que_recibe_de_menos' | 'clasificaciones'>, niveles: ReturnType<typeof nivelesDeCulpa>) {
  const jug = (d.jugadores ?? []) as { jugador: string; clase?: string; clase_id?: string; dps?: number; dano_recibido?: number }[];
  const det = (d.detalle ?? {}) as Record<string, { rotacion?: { vivo_s?: number; pausas_pct?: number; primer_golpe_s?: number }; supervivencia?: { bajo30_pct?: number }; apoyo?: { curacion?: number } }>;
  const grupo = d.meta.grupo;
  const de = (n: string) => jug.find((j) => j.jugador === n);
  const hace = (n: string) => { const c = de(n)?.clase_id ?? ''; return !TANQUES.has(c) && !SANADORES.has(c); };
  const intentosReales = ((d.intentos ?? []) as { progreso_pct?: number }[]).filter((i) => (i.progreso_pct ?? 0) >= 1).length;
  const medMuertes = med(niveles.map((n) => n.muertes));
  const medVivo = med(grupo.map((n) => det[n]?.rotacion?.vivo_s ?? NaN));
  const medPausas = med(grupo.map((n) => det[n]?.rotacion?.pausas_pct ?? NaN));
  const medPrimer = med(grupo.map((n) => det[n]?.rotacion?.primer_golpe_s ?? NaN));
  const medBajo30 = med(grupo.map((n) => det[n]?.supervivencia?.bajo30_pct ?? NaN));
  const dpsQueHacen = grupo.filter(hace).map((n) => de(n)?.dps ?? NaN);
  const medDps = med(dpsQueHacen);
  const noTanques = grupo.filter((n) => !TANQUES.has(de(n)?.clase_id ?? ''));
  const medRecibido = med(noTanques.map((n) => de(n)?.dano_recibido ?? NaN));
  const ven = r.ventanas_de_dano;
  const k = (x: number) => (x >= 1e6 ? `${es1(x / 1e6)}M` : x >= 1e3 ? `${es1(x / 1e3)}k` : String(Math.round(x)));
  // Lo que le pasa a medio grupo es un problema del grupo, no de uno: solo cuenta si le pasa a una minoría o a alguien más que a la mayoría
  const muertosEnRotura = (ven?.por_jugador ?? []).filter((x) => /^0 de/.test(x.roturas_vivo)).length;
  const medUnGolpe = med((r.repaso_de_muertes?.por_jugador ?? []).map((x) => x.de_un_golpe));

  const res: Record<string, Hecho[]> = {};
  for (const n of grupo) {
    const h: Hecho[] = [];
    const niv = niveles.find((x) => x.jugador === n);
    const j = de(n), clase = j?.clase ?? '', rot = det[n]?.rotacion, sup = det[n]?.supervivencia;
    if (niv && niv.muertes > medMuertes && medMuertes > 0) h.push({ tema: 'muertes', texto: `${niv.muertes} muertes en los intentos de verdad; lo normal en el grupo esa noche fue ${medMuertes}`, peso: 1 + niv.muertes / medMuertes });
    if (niv?.abre_intentos) h.push({ tema: 'abre', texto: `Fue el primero del grupo en caer en ${niv.abre_intentos} de los ${intentosReales} intentos de verdad`, peso: 2 + niv.abre_intentos });
    const rep = r.repaso_de_muertes?.por_jugador.find((x) => x.jugador === n);
    if (rep && rep.con_defensivo_sin_usar > 0) h.push({ tema: 'defensivo', texto: `Murió ${rep.con_defensivo_sin_usar} ${rep.con_defensivo_sin_usar === 1 ? 'vez' : 'veces'} con un escudo propio que probablemente tenía disponible (deducción)`, peso: 2 + rep.con_defensivo_sin_usar });
    if (rep && rep.de_un_golpe >= 2 && rep.de_un_golpe > medUnGolpe && rep.de_un_golpe / rep.muertes >= 0.6) h.push({ tema: 'un_golpe', texto: `${rep.de_un_golpe} de sus ${rep.muertes} muertes fueron de un solo golpe: de mecánica, no de curación`, peso: 1.2 + rep.de_un_golpe / 4 });
    const mec = r.fallos_de_mecanica?.por_jugador.find((x) => x.jugador === n);
    if (mec && mec.diferencia_pct !== null && mec.diferencia_pct >= 25) h.push({ tema: 'mecanica', texto: `Recibió ${mec.golpes_recibidos} golpes de ataques que no van a todo el grupo, frente a ${es1(mec.golpes_esperados)} al ritmo de sus compañeros (+${mec.diferencia_pct} %; deducción${TANQUES.has(j?.clase_id ?? '') ? ', y tanquea' : ''})`, peso: (1 + mec.diferencia_pct / 100) * (TANQUES.has(j?.clase_id ?? '') ? 0.6 : 1) });
    if (j?.dps && hace(n)) {
      const misma = jug.filter((x) => x.clase_id === j.clase_id && grupo.includes(x.jugador)).sort((a, b) => (b.dps ?? 0) - (a.dps ?? 0));
      if (misma.length > 1 && misma.at(-1)!.jugador === n) h.push({ tema: 'dps', texto: `Último en DPS de los ${misma.length} de su clase (${clase}): ${k(j.dps)} frente a ${k(misma[0].dps ?? 0)} de ${misma[0].jugador}`, peso: 1 + (misma[0].dps ?? 0) / j.dps - 1 });
      else if (misma.length === 1 && j.dps < medDps * 0.85) h.push({ tema: 'dps', texto: `Su DPS (${k(j.dps)}) queda un ${Math.round(100 - (100 * j.dps) / medDps)} % por debajo de la mediana de los que hacen daño (${k(medDps)})`, peso: 1 + medDps / j.dps - 1 });
    }
    const v = ven?.por_jugador.find((x) => x.jugador === n);
    if (v && /^0 de/.test(v.roturas_vivo) && muertosEnRotura <= grupo.length / 3) h.push({ tema: 'rotura', texto: `Llegó muerto a ${v.roturas_vivo.replace(/^0 de /, '') === '1' ? 'la única rotura de la barra de la noche' : `las ${v.roturas_vivo.replace(/^0 de /, '')} roturas de la barra`}: el momento de más daño, visto desde el suelo`, peso: 2.5 });
    else if (v && ven && hace(n) && v.multiplicador !== null && ven.grupo.multiplicador !== null && /^[1-9]/.test(v.roturas_vivo) && v.multiplicador < ven.grupo.multiplicador * 0.85) h.push({ tema: 'rotura', texto: `Con el jefe aturdido su DPS solo sube ×${es1(v.multiplicador)}; el del grupo, ×${es1(ven.grupo.multiplicador)}`, peso: 1 + ven.grupo.multiplicador / v.multiplicador - 1 });
    if (rot?.vivo_s && rot.vivo_s < medVivo * 0.8) h.push({ tema: 'vivo', texto: `Estuvo vivo ${Math.round(rot.vivo_s)} s de combate; la mediana del grupo, ${Math.round(medVivo)} s`, peso: 1 + medVivo / rot.vivo_s - 1 });
    if (rot?.pausas_pct && rot.pausas_pct >= 10 && rot.pausas_pct > medPausas * 1.5) h.push({ tema: 'pausas', texto: `Pasó el ${es1(rot.pausas_pct)} % de su tiempo vivo sin usar ninguna habilidad; la mediana del grupo, ${es1(medPausas)} %`, peso: 1 + rot.pausas_pct / medPausas / 2 });
    if (rot?.primer_golpe_s && rot.primer_golpe_s >= 3.5 && rot.primer_golpe_s > medPrimer * 1.5) h.push({ tema: 'arranque', texto: `Tarda ${es1(rot.primer_golpe_s)} s de media en dar su primer golpe; la mediana del grupo, ${es1(medPrimer)} s`, peso: 1 + rot.primer_golpe_s / medPrimer / 3 });
    if (sup?.bajo30_pct && sup.bajo30_pct >= 2 && sup.bajo30_pct > medBajo30 * 2) h.push({ tema: 'vida_baja', texto: `Pasó el ${es1(sup.bajo30_pct)} % de su tiempo vivo por debajo del 30 % de vida; la mediana del grupo, ${es1(medBajo30)} %`, peso: 1.1 });
    if (!TANQUES.has(j?.clase_id ?? '') && j?.dano_recibido && noTanques.length > 2 && j.dano_recibido > medRecibido * 1.3 && Math.max(...noTanques.map((x) => de(x)?.dano_recibido ?? 0)) === j.dano_recibido)
      h.push({ tema: 'recibido', texto: `Es quien más daño recibe sin tanquear: ${k(j.dano_recibido)}, frente a una mediana de ${k(medRecibido)}`, peso: 1 + j.dano_recibido / medRecibido - 1 });
    if (j?.clase_id === 'cleric') {
      const otros = jug.filter((x) => x.clase_id === 'cleric' && x.jugador !== n && grupo.includes(x.jugador)).map((x) => [x.jugador, det[x.jugador]?.apoyo?.curacion ?? 0] as const).sort((a, b) => b[1] - a[1]);
      const suya = det[n]?.apoyo?.curacion ?? 0;
      if (otros.length && suya < otros[0][1] * 0.85) h.push({ tema: 'curacion', texto: `Curó ${k(suya)} frente a ${k(otros[0][1])} del otro Clérigo, ${otros[0][0]}`, peso: 1 + otros[0][1] / Math.max(1, suya) - 1 });
    }
    const buf = (r.buffs_que_recibe_de_menos ?? []).filter((x) => x.jugador === n).sort((a, b) => (b.el_de_los_demas_pct - b.su_tiempo_con_el_buff_pct) - (a.el_de_los_demas_pct - a.su_tiempo_con_el_buff_pct))[0];
    if (buf) h.push({ tema: 'alcance', texto: `Tuvo ${buf.buff} de ${buf.de} el ${es1(buf.su_tiempo_con_el_buff_pct)} % de su tiempo vivo, frente al ${es1(buf.el_de_los_demas_pct)} % de los demás: probablemente se queda fuera de su alcance (deducción)`, peso: 1.1 });
    res[n] = h.sort((a, b) => b.peso - a.peso).slice(0, 5).map((x) => ({ ...x, peso: r1(x.peso) }));
    if (!res[n].length) res[n] = [{ tema: 'nada', texto: 'Sus cifras están dentro de lo normal del grupo: no hay nada gordo que echarle en cara', peso: 0 }];
  }
  return res;
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
  const niveles = nivelesDeCulpa(datos as Parameters<typeof nivelesDeCulpa>[0]);
  return {
    // Primero la munición ya preparada; los datos en bruto quedan detrás, para comprobar y para el detalle
    nivel_de_culpa: niveles,
    material_por_jugador: materialToxico(datos, { ...r, ...(repaso ? { repaso_de_muertes: repaso } : {}) }, niveles),
    ...r, ...(ventanas ? { ventanas_de_dano: ventanas } : {}), ...(repaso ? { repaso_de_muertes: repaso } : {}),
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
/** Frases de 5 palabras copiadas de EJEMPLOS_ESTILO. */
export function copiaEjemplos(a: Toxico): string[] {
  const ej = new Set<string>();
  for (const e of EJEMPLOS_ESTILO) { const p = soloPalabras(e).split(' ').filter(Boolean); for (let i = 0; i + 5 <= p.length; i++) ej.add(p.slice(i, i + 5).join(' ')); }
  const t = soloPalabras(textosToxico(a).join(' ')).split(' ').filter(Boolean);
  const res: string[] = [];
  for (let i = 0; i + 5 <= t.length; i++) { const f = t.slice(i, i + 5).join(' '); if (ej.has(f)) res.push(f); }
  return res;
}
const soloPalabras = (s: string) => ` ${s.toLowerCase().split(/[^a-záéíóúüñ]+/).filter(Boolean).join(' ')} `;

const EJEMPLO: Toxico = {
  titular: 'Una o dos frases demoledoras sobre la noche, con la cifra que más duele; se permite **negrita**.',
  jugadores: {
    NombreDelJugador: {
      pullas: ['Una pulla: UNA idea, con su cifra, en una o dos frases cortas.'],
      mejora: 'Qué hacer en la próxima raid, concreto y con su cifra.',
    },
  },
};

/**
 * Ejemplos de tono, de OTROS ámbitos (fútbol, cocina, oficina) a propósito: le enseñan el estilo (en la primera
 * versión, solo con reglas, escribía «tus 3 muertes son de un golpe: A, B y C» para todos) sin frases que pueda pegar
 * en una raid; con ejemplos de raid las copiaba tal cual (15/11/2026). `copiaEjemplos` rechaza que los copie.
 */
export const EJEMPLOS_ESTILO = [
  'Siete goles encajados cuando la media de la liga es dos: la red ya lleva tu nombre bordado.',
  'El primero en quemar el arroz en dos de los tres concursos. Gracias por indicarle al jurado por dónde empezar.',
  'Un cuarto de la jornada sin tocar el teclado. Hasta la impresora que lleva un mes rota produce más.',
  'El único penalti del partido y tú en el vestuario. Tu gran momento, escuchado por la radio.',
  'Último de los tres cocineros de la línea, a nueve platos del segundo. Lo tuyo no es un ritmo, es una siesta.',
  'Dos veces con el extintor en la mano y dos veces mirando cómo ardía la sartén. Lo guardabas para algo especial.',
  'Te caen el doble de broncas que a tus compañeros por los mismos fallos. No es mala suerte: es un abono de temporada.',
];

export const PROMPT_TOXICO = `Eres el comentarista más cruel y gracioso de raids de Aion 2, para la pestaña «Sin filtro» de la web DPS Aion. Devuelves SOLO un objeto json, en español, con lo MALO de cada jugador de una noche de raid y cómo dejar de hacerlo.

Tu munición:
- material_por_jugador: para cada jugador, sus peores cifras ya comparadas con el grupo o con su clase, de más a menos grave (tema, texto, peso). Es la base de sus pullas: cada pulla sale de UN hecho de su material, de temas distintos entre sí, empezando por el de más peso.
- nivel_de_culpa: cuántas pullas lleva cada uno (pullas_max): «alto» hasta 4, «medio» hasta 2, «bajo» UNA corta y al siguiente. Si su material dice que no hay nada gordo, una sola pulla ligera («hoy te libras por poco»).
- El resto del json (la raid, clasificaciones, analisis_principal) es para comprobar y para el titular; no lo conviertas en listas.

Estilo. Ejemplos del TONO sacados de otros ámbitos (fútbol, cocina, oficina): traslada la mala uva a la raid con tus propias imágenes; no copies ni adaptes estas frases:
${EJEMPLOS_ESTILO.map((e) => `- «${e}»`).join('\n')}

- Ironía, exageración, comparaciones con mala uva, preguntas retóricas y humor negro sobre la jugada. Cada pulla con una forma distinta: no empieces dos pullas igual ni repitas un chiste con otro jugador.
- UNA idea por pulla, en una o dos frases cortas (menos de 200 caracteres). Nada de listas de ataques: como mucho UN ataque del jefe por pulla, y solo si es el centro del chiste.
- Nada de elogios ni consuelo («buen trabajo», «no está mal», «al menos»). Lo bueno solo sirve para hundir («de qué sirve ser el que más pega si…»).
- Se critica la JUGADA, nunca a la persona: nada sobre físico, inteligencia, edad, familia, origen, género o rasgos personales; nada de insultos ni groserías. Duele porque la cifra no deja escapatoria.
- La mejora: una frase concreta y distinta para cada jugador, también con algo de mala uva.

Verdad ante todo:
- Solo hechos de los datos. Lo que el material marca como deducción («probablemente», «deducción») se dice como deducción.
- No contradigas analisis_principal. No culpes a nadie de lo que no es suyo: el objetivo fijo de un ataque, morir sin sanador vivo o con medio grupo caído, el DPS bajo de quien cura o tanquea.
- No hables de especializaciones ni de debuffs sobre el jefe.
- El rol sale SOLO de la clase (Templario = tanque; Clérigo = sanador; Cantor = apoyo y curación; el resto, daño): no inventes roles ni posiciones.
- Los pulls fallidos (menos del 1 % de vida al jefe) y las muertes sin habilidad no cuentan para nada.

Formato:
- Ids de habilidades y npcs como números sueltos (1803396); la web pone el nombre. Nunca el nombre junto al id ni el id en negrita. A cada jugador, solo sus habilidades o las del jefe.
- A cada jugador háblale de tú, en español neutro: nada de vosotros («os», «vuestro», «tenéis», «morís»). El titular, en impersonal o en primera persona del plural («nos», «morimos»).
- No asumas el género de nadie. Cifras al estilo español (4,8k DPS; 37 %). Sin nombres de campos del json.
- Una entrada en «jugadores» para CADA jugador de raid.meta.grupo (su nombre exacto) y nadie más.
- Sin texto fuera del json; **negrita** con moderación.

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
export function revisarToxico(x: unknown, grupo: string[], referencia?: Toxico, habilidades?: Record<string, Set<string>>, maximos?: Record<string, number>, permitidas: string | null = '', clases?: Record<string, string>): { toxico?: Toxico; problemas: string[] } {
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
    // vosotros que formasVosotros no ve (es del análisis principal): «os», «vuestro», presente en -ís («os aburrís»)
    const vos2 = [...new Set(textosToxico(a).join(' ').match(/(?<!\p{L})(os|vuestr[oa]s?|\p{L}{3,}ís)(?!\p{L})/giu) ?? [])];
    if (vos2.length) problemas.push(`no uses vosotros (${vos2.slice(0, 6).join(', ')}): a cada jugador háblale de tú y el titular en impersonal o con «nos»`);
    const temas = textosToxico(a).join(' ').toLowerCase();
    // («talentos», «combinación que más daño haga»: la misma idea con otras palabras, 15/11/2026)
    if (/especializaci|talento|combinaci[oó]n que m[aá]s/.test(temas)) problemas.push('no hables de especializaciones ni talentos: no se sabe cuál rinde más');
    const conDebuffs = Object.values(a.jugadores).filter((j) => /debuff/i.test([...j.pullas, j.mejora].join(' '))).length;
    if (conDebuffs > 1) problemas.push('no hables de debuffs sobre el jefe');
    for (const [n, j] of Object.entries(a.jugadores)) for (const p of j.pullas) {
      if (p.length > 260) problemas.push(`una pulla de ${n} es demasiado larga (${p.length} caracteres): una idea, en menos de 200`);
      if ((p.match(/\b18\d{5}\b/g) ?? []).length >= 3) problemas.push(`una pulla de ${n} enumera ataques: como mucho uno por pulla`);
    }
    // De estilo, como las muletillas: en la última vuelta (permitidas = null) no se mira
    const copias = permitidas === null ? [] : copiaEjemplos(a);
    if (copias.length) problemas.push(`copias los ejemplos de estilo («${copias[0]}»): inventa tus frases`);
    // Roles inventados («tanqueas desde tan lejos» a un Asesino, 15/11/2026): el rol sale de la clase
    if (clases) for (const [n, j] of Object.entries(a.jugadores)) {
      const t = [...j.pullas, j.mejora].join(' ');
      if (!TANQUES.has(clases[n] ?? '') && /(?<!\p{L})tanque(as|es|ando)(?!\p{L})/iu.test(t)) problemas.push(`${n} no tanquea (${clases[n]}): no le hables como si fuera tanque`);
      if (!SANADORES.has(clases[n] ?? '') && /(?<!\p{L})(cur(as|es|ando)|necesites curar)(?!\p{L})/iu.test(t)) problemas.push(`${n} no es sanador (${clases[n]}): no le hables como si curase`);
    }
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
