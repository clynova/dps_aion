// Nombres de habilidades y NPC desde questlog.gg (la misma fuente que la app de Questlog: combatLog.entities), para los
// ids que aparecen en las raids guardadas. Port de tools/actualizar-nombres.ps1. Se ejecuta tras cada subida y a diario
// (/api/cron/nombres). Los apodos (tabla apodos) no se tocan: ganan a estos nombres al mostrarlos.
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { nombres } from '@/lib/db/schema';
import type { Idioma } from '@/lib/i18n';

const BASE = 'https://questlog.gg/aion-2/api/trpc/';
const TEXTOS: Record<Idioma, { generico: string; zona: string; maldicion: string; invocada: string }> = {
  es: { generico: 'Ataque', zona: 'Zona', maldicion: 'Zona de maldición', invocada: 'Zona invocada' },
  en: { generico: 'Attack', zona: 'Zone', maldicion: 'Curse zone', invocada: 'Summoned zone' },
};

type Habilidad = { name?: string; icon?: string | null };
type Npc = { name?: string };

async function trpc<T>(proc: string, idioma: Idioma): Promise<T> {
  const r = await fetch(`${BASE}${proc}?input=${encodeURIComponent(JSON.stringify({ language: idioma }))}`, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`questlog.gg ${proc} (${idioma}): ${r.status}`);
  return ((await r.json()) as { result: { data: T } }).result.data; // Response.json() siempre decodifica en UTF-8
}

/** Las invocaciones invisibles son zonas de daño de una habilidad del jefe, no enemigos: «Zona 8-2». */
export function nombreNpc(bruto: string, idioma: Idioma): string {
  const L = TEXTOS[idioma];
  const m = /^N_Invisible_Summon_.*?(Skill)_?(\d+)(?:_(\d+))?/.exec(bruto);
  if (m) return `${L.zona} ${Number(m[2])}${m[3] ? `-${Number(m[3])}` : ''}`;
  if (/^N_Invisible_Summon_.*_Curse/.test(bruto)) return L.maldicion;
  if (/^N_Invisible_Summon_/.test(bruto)) return L.invocada;
  return bruto;
}

/** Ruta corta del icono bajo Texture/. Las habilidades de NPC (ids de 7 cifras) llevan un relleno que no las representa. */
export function iconoCorto(id: string, icono: string | null | undefined): string | null {
  const r = String(icono ?? '').replace(/^\/assets\/Game\/UI\/Resource\/Texture\//, '').replace(/\.[^./]+$/, '');
  if (!r || (r === 'Skill/ICON_TE_SKILL_001' && id.length < 8)) return null;
  return r;
}

/** Ids de habilidades y NPC que usan las raids guardadas (de todos los grupos). */
async function idsUsados() {
  const filas = await db.execute<{ tipo: 'h' | 'n'; id: string }>(sql`
    select distinct 'h' tipo, habilidad id from casteos_jefe
    union select 'h', habilidad from desglose
    union select 'h', habilidad from muertes where habilidad is not null
    union select 'h', ultima_causa from intentos where ultima_causa is not null
    union select 'n', npc_jefe::text from raids
    union select 'n', npc::text from raid_otros
    union select 'n', origen from muertes where origen is not null`);
  const h = new Set<string>(), n = new Set<string>();
  for (const f of filas.rows) if (/^\d+$/.test(f.id) && f.id !== '0') (f.tipo === 'h' ? h : n).add(f.id);
  return { h, n };
}

export async function actualizarNombres() {
  const { h, n } = await idsUsados();
  const resumen: Record<string, { habilidades: number; npcs: number; sinNombre: number }> = {};
  for (const idioma of ['es', 'en'] as const) {
    const [S, N] = await Promise.all([
      trpc<Record<string, Habilidad>>('combatLog.entities.skills', idioma),
      trpc<{ npc: Record<string, Npc> }>('combatLog.entities.names', idioma).then((x) => x.npc),
    ]);
    const filas: (typeof nombres.$inferInsert)[] = [];
    let sinNombre = 0;
    for (const id of h) {
      let nombre = S[id]?.name;
      if (!nombre) { sinNombre++; continue; }
      if (nombre === TEXTOS[idioma].generico) nombre = `${nombre} ${id}`; // nombre genérico del juego: se distingue por su número
      filas.push({ tipo: 'habilidad', id: Number(id), idioma, nombre, icono: iconoCorto(id, S[id].icon) });
    }
    const nh = filas.length;
    for (const id of n) { const b = N[id]?.name; if (b) filas.push({ tipo: 'npc', id: Number(id), idioma, nombre: nombreNpc(b, idioma), icono: null }); }
    for (let i = 0; i < filas.length; i += 500) {
      await db.insert(nombres).values(filas.slice(i, i + 500)).onConflictDoUpdate({
        target: [nombres.tipo, nombres.id, nombres.idioma],
        set: { nombre: sql`excluded.nombre`, icono: sql`excluded.icono` },
      });
    }
    resumen[idioma] = { habilidades: nh, npcs: filas.length - nh, sinNombre };
  }
  return resumen;
}
