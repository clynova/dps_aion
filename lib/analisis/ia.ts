// Análisis automático de una raid con DeepSeek: resumen → análisis en español → traducción al inglés → validación →
// tabla analisis (autor «deepseek»). Una raid no se vuelve a analizar antes de 24 h: la hora se reserva en
// raids.analisis_ia ANTES de llamar a la IA (dos peticiones a la vez no gastan dos análisis) y se devuelve si falla.
import 'server-only';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { analisis, auditoria, raids } from '@/lib/db/schema';
import type { Analisis } from '@/lib/ingest/analisis';
import { reconstruirRaid } from '@/lib/raids/reconstruir';
import { seguimientoParaIA, seguir, type AnalisisSeg, type RaidSeg } from '@/lib/raids/seguimiento';
import { nombresPara, raidAnterior } from '@/lib/raids/vista';
import { deepseekJson, ErrorIA, type Mensaje, type RespuestaIA, type Uso } from './deepseek';
import { formatearCifras, habilidadesPorJugador, idsDeLaRaid, NOTA_IA, quitarNombresTrasIds, PROMPT_SISTEMA, PROMPT_TRADUCIR, resumenParaIA, revisarAnalisis, type Historial, type Nombres, type SeguimientoIA } from './resumen';

export const ESPERA_HORAS = 24;
type Llamar = (m: Mensaje[]) => Promise<RespuestaIA>;

/** Pide el json a la IA y lo valida; si no vale, se lo devuelve con los problemas y lo vuelve a intentar (3 veces en total). */
async function pedirValidado(llamar: Llamar, mensajes: Mensaje[], grupo: string[], referencia: Analisis | undefined, uso: Uso, habilidades?: Record<string, Set<string>>) {
  let problemas: string[] = [];
  for (let intento = 0; intento < 3; intento++) {
    let r: RespuestaIA;
    try { r = await llamar(mensajes); }
    catch (e) { if (e instanceof ErrorIA && ['vacia', 'json', 'cortada'].includes(e.motivo) && intento < 2) { problemas = [e.message]; continue; } throw e; }
    uso.entrada += r.uso.entrada; uso.salida += r.uso.salida; uso.cache += r.uso.cache;
    const v = revisarAnalisis(r.json, grupo, referencia, habilidades);
    if (v.analisis) return v.analisis;
    problemas = v.problemas;
    mensajes = [...mensajes, { role: 'assistant', content: JSON.stringify(r.json) },
      { role: 'user', content: `El json no es válido: ${problemas.join('; ')}. Corrígelo y devuelve el json completo.` }];
  }
  throw new ErrorIA('json', `La IA no devolvió un análisis válido: ${problemas.join('; ')}`);
}

/** El análisis en los dos idiomas. Sin base de datos: se prueba con una IA simulada. */
export async function generarAnalisis(datos: Parameters<typeof resumenParaIA>[0], nombres: Nombres, historial: Historial, llamar: Llamar = deepseekJson, seguimiento?: SeguimientoIA) {
  const uso: Uso = { entrada: 0, salida: 0, cache: 0 };
  const grupo = datos.meta.grupo;
  const entrada = JSON.stringify(resumenParaIA(datos, nombres, historial, seguimiento));
  const habilidades = habilidadesPorJugador(datos as { detalle?: Record<string, unknown>; ventanas?: unknown; especializaciones?: unknown });
  const es = await pedirValidado(llamar, [{ role: 'system', content: PROMPT_SISTEMA }, { role: 'user', content: entrada }], grupo, undefined, uso, habilidades);
  const en = await pedirValidado(llamar, [{ role: 'system', content: PROMPT_TRADUCIR }, { role: 'user', content: JSON.stringify(es) }], grupo, es, uso, habilidades);
  const ids = idsDeLaRaid(datos);
  return {
    es: formatearCifras(quitarNombresTrasIds({ ...es, notas: [...(es.notas ?? []), NOTA_IA.es] }), 'es', ids),
    en: formatearCifras(quitarNombresTrasIds({ ...en, notas: [...(en.notas ?? []), NOTA_IA.en] }), 'en', ids),
    uso,
  };
}

/** Reserva el análisis de la raid si han pasado 24 h desde el anterior (atómico: FOR UPDATE + condición). */
export async function reservarAnalisis(raidId: string) {
  // Una consulta sin Drizzle devuelve las fechas como texto: se convierten (al devolver la reserva, Drizzle espera Date)
  const r = await db.execute<{ anterior: string | Date | null; nueva: string | Date }>(sql`
    update raids r set analisis_ia = now()
    from (select id, analisis_ia anterior from raids where id = ${raidId} for update) o
    where r.id = o.id and (o.anterior is null or o.anterior < now() - make_interval(hours => ${ESPERA_HORAS}))
    returning o.anterior, r.analisis_ia nueva`);
  if (r.rows.length) {
    const { anterior, nueva } = r.rows[0];
    return { ok: true as const, anterior: anterior ? new Date(anterior) : null, nueva: new Date(nueva) };
  }
  const [x] = await db.select({ t: raids.analisisIa }).from(raids).where(eq(raids.id, raidId));
  return { ok: false as const, disponible: x?.t ? new Date(new Date(x.t).getTime() + ESPERA_HORAS * 3_600_000) : null };
}

export type Reserva = Awaited<ReturnType<typeof reservarAnalisis>>;

/** Cuándo se puede volver a analizar (null = ya). */
export function proximoAnalisis(ultimo: Date | null | undefined): Date | null {
  if (!ultimo) return null;
  const t = new Date(ultimo).getTime() + ESPERA_HORAS * 3_600_000;
  return t > Date.now() ? new Date(t) : null;
}

export type ResultadoIA = { ok: true; uso: Uso; segundos: number } | { ok: false; motivo: 'espera'; disponible: Date | null } | { ok: false; motivo: 'ya-analizada' };

/**
 * Analiza una raid y guarda el resultado. origen «auto» (tras subirla) no pisa un análisis que ya exista (de Claude o
 * de un admin); «manual» lo sustituye. En los dos casos manda la espera de 24 h.
 */
export async function analizarRaid(raidId: string, opciones: { origen: 'auto' | 'manual'; usuarioId?: string | null; reserva?: Reserva }): Promise<ResultadoIA> {
  if (opciones.origen === 'auto') {
    const ya = await db.select({ c: analisis.contenido }).from(analisis).where(and(eq(analisis.raidId, raidId), eq(analisis.idioma, 'es')));
    if (ya.some((a) => !(a.c as { pendiente?: boolean }).pendiente)) return { ok: false, motivo: 'ya-analizada' };
  }
  const reserva = opciones.reserva ?? await reservarAnalisis(raidId);
  if (!reserva.ok) return { ok: false, motivo: 'espera', disponible: reserva.disponible };
  const t0 = Date.now();
  try {
    const [raid] = await db.select().from(raids).where(eq(raids.id, raidId));
    const datos = await reconstruirRaid(raidId);
    if (!raid || !datos) throw new Error('raid no encontrada');
    const anteriores = await db.select().from(raids)
      .where(and(eq(raids.grupoId, raid.grupoId), eq(raids.npcJefe, raid.npcJefe), ne(raids.id, raidId))).orderBy(desc(raids.fecha)).limit(10);
    const historial: Historial = anteriores.map((x) => ({ fecha: (x.meta as { fecha: string }).fecha, intentos: x.intentos, mejor_pct: x.mejorPct, matado: x.matado, muertes: x.muertesGrupo, dps_grupo_medio: x.dpsGrupoMedio }));
    const nombres = await nombresPara('es', raid.grupoId);
    // Qué pasó con las recomendaciones de la raid anterior de este jefe (lib/raids/seguimiento.ts)
    const previa = await raidAnterior(raid, 'es');
    const seguimiento = previa ? seguimientoParaIA(seguir(datos as unknown as RaidSeg, previa.datos as unknown as RaidSeg, previa.analisis as AnalisisSeg)) : undefined;
    const { es, en, uso } = await generarAnalisis(datos as unknown as Parameters<typeof generarAnalisis>[0], nombres, historial, deepseekJson, seguimiento);
    await db.transaction(async (tx) => {
      for (const [idioma, contenido] of [['es', es], ['en', en]] as const) {
        // El automático no pisa un análisis que haya llegado mientras la IA pensaba (p. ej. el de Claude con publicar.ps1)
        await tx.insert(analisis).values({ raidId, idioma, contenido, autor: 'deepseek' })
          .onConflictDoUpdate({ target: [analisis.raidId, analisis.idioma], set: { contenido, autor: 'deepseek', actualizado: new Date() },
            ...(opciones.origen === 'auto' ? { setWhere: sql`${analisis.autor} = 'deepseek' or coalesce((${analisis.contenido} ->> 'pendiente')::boolean, false)` } : {}) });
      }
      await tx.insert(auditoria).values({ grupoId: raid.grupoId, usuarioId: opciones.usuarioId ?? null, accion: 'analisis.ia', ref: raid.slug,
        detalle: { origen: opciones.origen, modelo: process.env.DEEPSEEK_MODEL || 'deepseek-flash', ...uso, segundos: Math.round((Date.now() - t0) / 1000) } });
    });
    revalidatePath('/[lang]/g/[grupo]', 'layout');
    return { ok: true, uso, segundos: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    // Falló: se devuelve la reserva para que se pueda reintentar sin esperar 24 h (nadie más pudo reservar entretanto)
    await db.update(raids).set({ analisisIa: reserva.anterior }).where(eq(raids.id, raidId));
    throw e;
  }
}

export type EstadoIA = { estado: 'disponible' | 'espera' | 'en-curso' | 'listo'; disponible: string | null };

/** Estado del análisis automático de una raid, para el botón: en curso (reservado hace < 6 min y sin resultado). */
export async function estadoAnalisisIA(raidId: string): Promise<EstadoIA> {
  const [r] = await db.select({ ia: raids.analisisIa }).from(raids).where(eq(raids.id, raidId));
  const [a] = await db.select({ autor: analisis.autor, actualizado: analisis.actualizado }).from(analisis).where(and(eq(analisis.raidId, raidId), eq(analisis.idioma, 'es')));
  const ia = r?.ia ? new Date(r.ia) : null;
  const prox = proximoAnalisis(ia);
  const hecho = !!(ia && a?.autor === 'deepseek' && new Date(a.actualizado).getTime() >= ia.getTime());
  if (ia && !hecho && Date.now() - ia.getTime() < 6 * 60_000) return { estado: 'en-curso', disponible: prox?.toISOString() ?? null };
  if (prox) return { estado: hecho ? 'listo' : 'espera', disponible: prox.toISOString() };
  return { estado: 'disponible', disponible: null };
}
