// «Solicitar el análisis de mi perfil»: el botón del buscador de la página de un grupo avisa al webhook de Discord de
// ese grupo. Sustituye a api/solicitar.js de la web estática: la espera ya no vive en memoria de cada instancia sino en
// la tabla `solicitudes` (10 minutos por jugador y grupo, y como mucho 20 avisos por hora en cada grupo).
// El mensaje solo lleva datos de la base (nombre y cifras del jugador), nunca texto de quien lo pide.
import 'server-only';
import { and, count, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { webhookDe, type Grupo } from '@/lib/db/grupos';
import { jugadores, solicitudes } from '@/lib/db/schema';
import { enviarDiscord } from '@/lib/discord';
import { localeDe, rutaEn, traductor, type Idioma } from '@/lib/i18n';
import type { Rol } from '@/lib/permisos';
import { grupoParaVer } from '@/lib/raids/vista';

export const ESPERA_MS = 10 * 60_000;
export const MAX_POR_HORA = 20;

export type ResultadoSolicitud =
  | { ok: true; repetida?: boolean }
  | { ok: false; error: 'sin-webhook' | 'jugador' | 'limite' | 'discord' };

type Fila = { nombre: string; raids: number; kills: number; dps_medio: number; hps_medio: number; muertes_intento: number; gs: number; ultima: string; perfil: boolean };

/** Texto del aviso, en el idioma de la página desde la que se pidió. */
export function mensajeSolicitud(p: Fila, url: string, idioma: Idioma): string {
  const t = traductor(idioma);
  const loc = localeDe(idioma);
  const k = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
  const n2 = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 });
  return [
    t('solicitud.titulo', { n: p.nombre }),
    t('solicitud.cifras', { raids: p.raids, kills: p.kills, dps: k.format(p.dps_medio), hps: k.format(p.hps_medio), m: n2.format(p.muertes_intento), gs: p.gs }),
    t('solicitud.ultima', { d: String(p.ultima).slice(0, 10), p: t(p.perfil ? 'solicitud.si' : 'solicitud.no') }),
    url,
  ].join('\n');
}

/**
 * Pide el análisis del jugador `slug` al grupo. Solo vale para jugadores que quien pide ve en la página del grupo
 * (con las mismas reglas de visibilidad). Si el aviso falla, la solicitud se borra para poder reintentar.
 */
export async function solicitarAnalisis(o: { grupo: Grupo; rol: Rol | null; slug: string; usuarioId: string | null; idioma: Idioma; origen: string }): Promise<ResultadoSolicitud> {
  const webhook = webhookDe(o.grupo);
  if (!webhook) return { ok: false, error: 'sin-webhook' };
  const [jug] = await db.select({ id: jugadores.id }).from(jugadores).where(eq(jugadores.slug, o.slug)).limit(1);
  if (!jug) return { ok: false, error: 'jugador' };
  const { jugadores: indice } = await grupoParaVer(o.grupo, o.rol, o.idioma);
  const p = (indice as (Fila & { slug: string })[]).find((j) => j.slug === o.slug);
  if (!p) return { ok: false, error: 'jugador' };

  // Reserva atómica: un candado por grupo para que dos peticiones a la vez no pasen las dos el límite
  const reserva = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'solicitud:' + o.grupo.id}))`);
    const desde = new Date(Date.now() - ESPERA_MS);
    const [{ n: recientes }] = await tx.select({ n: count() }).from(solicitudes)
      .where(and(eq(solicitudes.grupoId, o.grupo.id), eq(solicitudes.jugadorId, jug.id), gt(solicitudes.creada, desde)));
    if (recientes > 0) return 'repetida' as const;
    const [{ n: hora }] = await tx.select({ n: count() }).from(solicitudes)
      .where(and(eq(solicitudes.grupoId, o.grupo.id), gt(solicitudes.creada, new Date(Date.now() - 3_600_000))));
    if (hora >= MAX_POR_HORA) return 'limite' as const;
    const [fila] = await tx.insert(solicitudes).values({ jugadorId: jug.id, grupoId: o.grupo.id, usuarioId: o.usuarioId }).returning({ id: solicitudes.id });
    return fila.id;
  });
  if (reserva === 'repetida') return { ok: true, repetida: true };
  if (reserva === 'limite') return { ok: false, error: 'limite' };

  const url = o.origen + rutaEn(o.idioma, `/jugadores/${o.slug}`);
  if (!(await enviarDiscord(webhook, mensajeSolicitud(p, url, o.idioma)))) {
    await db.delete(solicitudes).where(eq(solicitudes.id, reserva));
    return { ok: false, error: 'discord' };
  }
  await db.update(solicitudes).set({ avisada: new Date().toISOString() }).where(eq(solicitudes.id, reserva));
  return { ok: true };
}
