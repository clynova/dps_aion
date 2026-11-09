// Nombres de habilidades y NPC desde questlog.gg (la misma fuente que la app de Questlog: combatLog.entities), para los
// ids que aparecen en las raids guardadas. Port de tools/actualizar-nombres.ps1.
//
// questlog.gg está detrás de Cloudflare y responde 403 («Just a moment…», cf-mitigated: challenge) a las funciones de
// Vercel (comprobado el 9/11/2026), y su API no tiene CORS, así que el navegador tampoco la puede leer. Por eso los
// nombres llegan por tres vías:
//  1. Semilla del repo (nombres.json / nombres.en.json): apodos globales y nombres conocidos. Se aplica en cada
//     despliegue (scripts/semilla-nombres.mts en build:vercel) y en cada actualizarNombres().
//  2. El PC: publicar.ps1 pregunta qué ids de las raids del grupo no tienen nombre (GET /api/v1/grupos/:g/nombres),
//     los busca en questlog.gg y los manda (POST). Se ejecuta tras cada subida y con -Nombres.
//  3. Descarga directa (actualizarNombres): vale en local (npm run nombres) y en el cron por si Cloudflare deja pasar.
// En los tres casos el formato sale de aquí (filasQuestlog), y los apodos (tabla apodos) ganan al mostrarlos.
import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { apodos, nombres } from '@/lib/db/schema';
import type { Idioma } from '@/lib/i18n';
import semillaEs from '@/nombres.json';
import semillaEn from '@/nombres.en.json';

const BASE = 'https://questlog.gg/aion-2/api/trpc/';
const TEXTOS: Record<Idioma, { generico: string; zona: string; maldicion: string; invocada: string; esbirro: string }> = {
  es: { generico: 'Ataque', zona: 'Zona', maldicion: 'Zona de maldición', invocada: 'Zona invocada', esbirro: 'Esbirro invocado' },
  en: { generico: 'Attack', zona: 'Zone', maldicion: 'Curse zone', invocada: 'Summoned zone', esbirro: 'Summoned minion' },
};
const IDIOMAS = ['es', 'en'] as const;

/** Lo que da questlog.gg (o manda el PC) por idioma: habilidades { id: { name, icon } } y npcs { id: nombre en bruto }. */
export type Questlog = { habilidades: Record<string, { name?: string; icon?: string | null } | undefined>; npcs: Record<string, string | undefined> };
type Fila = typeof nombres.$inferInsert;

async function trpc<T>(proc: string, idioma: Idioma): Promise<T> {
  const r = await fetch(`${BASE}${proc}?input=${encodeURIComponent(JSON.stringify({ language: idioma }))}`, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`questlog.gg ${proc} (${idioma}): ${r.status}${r.headers.get('cf-mitigated') ? ' (Cloudflare bloquea este servidor)' : ''}`);
  return ((await r.json()) as { result: { data: T } }).result.data; // Response.json() siempre decodifica en UTF-8
}

/** Las invocaciones invisibles son zonas de daño de una habilidad del jefe, no enemigos: «Zona 8-2». */
export function nombreNpc(bruto: string, idioma: Idioma): string {
  const L = TEXTOS[idioma];
  const m = /^N_Invisible_Summon_.*?(Skill)_?(\d+)(?:_(\d+))?/.exec(bruto);
  if (m) return `${L.zona} ${Number(m[2])}${m[3] ? `-${Number(m[3])}` : ''}`;
  if (/^N_Invisible_Summon_.*_Curse/.test(bruto)) return L.maldicion;
  if (/^N_Invisible_Summon_/.test(bruto)) return L.invocada;
  if (/^M_Summon_/.test(bruto)) return L.esbirro; // esbirro visible de una habilidad del jefe (nombre interno sin traducir)
  return bruto;
}

/** Ruta corta del icono bajo Texture/. Las habilidades de NPC (ids de 7 cifras) llevan un relleno que no las representa. */
export function iconoCorto(id: string, icono: string | null | undefined): string | null {
  const r = String(icono ?? '').replace(/^\/assets\/Game\/UI\/Resource\/Texture\//, '').replace(/\.[^./]+$/, '');
  if (!r || (r === 'Skill/ICON_TE_SKILL_001' && id.length < 8)) return null;
  return r;
}

/** Filas de la tabla nombres para esos ids, con el formato de la web («Ataque <id>», «Zona 8-2», icono corto). */
export function filasQuestlog(ids: { h: Iterable<string>; n: Iterable<string> }, idioma: Idioma, q: Questlog) {
  const filas: Fila[] = [];
  let sinNombre = 0;
  for (const id of ids.h) {
    let nombre = String(q.habilidades[id]?.name ?? '').trim();
    if (!nombre) { sinNombre++; continue; }
    if (nombre === TEXTOS[idioma].generico) nombre = `${nombre} ${id}`; // nombre genérico del juego: se distingue por su número
    filas.push({ tipo: 'habilidad', id: Number(id), idioma, nombre: nombre.slice(0, 200), icono: iconoCorto(id, q.habilidades[id]?.icon)?.slice(0, 300) ?? null });
  }
  for (const id of ids.n) {
    const b = String(q.npcs[id] ?? '').trim();
    if (b) filas.push({ tipo: 'npc', id: Number(id), idioma, nombre: nombreNpc(b, idioma).slice(0, 200), icono: null });
    else sinNombre++;
  }
  return { filas, sinNombre };
}

/** pisar = false (semilla): solo rellena huecos y sustituye nombres internos sin traducir (M_Summon_…, N_…). */
async function guardar(filas: Fila[], pisar: boolean) {
  for (let i = 0; i < filas.length; i += 500) {
    await db.insert(nombres).values(filas.slice(i, i + 500)).onConflictDoUpdate({
      target: [nombres.tipo, nombres.id, nombres.idioma],
      set: { nombre: sql`excluded.nombre`, icono: sql`excluded.icono` },
      ...(pisar ? {} : { setWhere: sql`${nombres.nombre} ~ '^[MN]_[A-Za-z]'` }),
    });
  }
}

/** Ids de habilidades y NPC que usan las raids guardadas (de un grupo o de todos). */
export async function idsUsados(grupoId?: string) {
  const g = grupoId ? sql`r.grupo_id = ${grupoId}` : sql`true`;
  const filas = await db.execute<{ tipo: 'h' | 'n'; id: string }>(sql`
    select distinct 'h' tipo, x.habilidad id from casteos_jefe x join raids r on r.id = x.raid_id where ${g}
    union select 'h', x.habilidad from desglose x join raids r on r.id = x.raid_id where ${g}
    union select 'h', x.habilidad from muertes x join raids r on r.id = x.raid_id where ${g} and x.habilidad is not null
    union select 'h', x.ultima_causa from intentos x join raids r on r.id = x.raid_id where ${g} and x.ultima_causa is not null
    union select 'n', r.npc_jefe::text from raids r where ${g}
    union select 'n', x.npc::text from raid_otros x join raids r on r.id = x.raid_id where ${g}
    union select 'n', x.origen from muertes x join raids r on r.id = x.raid_id where ${g} and x.origen is not null`);
  const h = new Set<string>(), n = new Set<string>();
  for (const f of filas.rows) if (/^\d+$/.test(f.id) && f.id !== '0') (f.tipo === 'h' ? h : n).add(f.id);
  return { h, n };
}

/** Ids de las raids del grupo a los que les falta el nombre en algún idioma (los que el PC debe buscar). */
export async function idsSinNombre(grupoId: string) {
  const { h, n } = await idsUsados(grupoId);
  const hay = await db.execute<{ tipo: 'habilidad' | 'npc'; id: string }>(sql`
    select tipo, id::text id from nombres group by tipo, id having count(distinct idioma) >= ${IDIOMAS.length}`);
  const completos = new Set(hay.rows.map((f) => `${f.tipo === 'habilidad' ? 'h' : 'n'}${f.id}`));
  return {
    habilidades: [...h].filter((id) => !completos.has(`h${id}`)).map(Number).sort((a, b) => a - b),
    npcs: [...n].filter((id) => !completos.has(`n${id}`)).map(Number).sort((a, b) => a - b),
  };
}

/** Guarda lo que manda el PC, solo para ids que usan las raids de ese grupo. */
export async function guardarNombresDelPc(grupoId: string, datos: Partial<Record<Idioma, Partial<Questlog>>>) {
  const ids = await idsUsados(grupoId);
  const resumen: Partial<Record<Idioma, { guardados: number; sinNombre: number }>> = {};
  for (const idioma of IDIOMAS) {
    const q = datos[idioma];
    if (!q) continue;
    const habilidades = q.habilidades ?? {}, npcs = q.npcs ?? {};
    const pedidos = { h: [...ids.h].filter((id) => Object.hasOwn(habilidades, id)), n: [...ids.n].filter((id) => Object.hasOwn(npcs, id)) };
    const { filas, sinNombre } = filasQuestlog(pedidos, idioma, { habilidades, npcs });
    await guardar(filas, true);
    resumen[idioma] = { guardados: filas.length, sinNombre };
  }
  return resumen;
}

type Semilla = { habilidades?: Record<string, string>; npcs?: Record<string, string>; iconos?: Record<string, string>; apodos?: Record<string, string> };

/** Semilla del repo: los apodos globales se sustituyen por los del repo; los nombres solo rellenan huecos. */
export async function aplicarSemilla() {
  const r = { nombres: 0, apodos: 0 };
  for (const [idioma, s] of [['es', semillaEs], ['en', semillaEn]] as [Idioma, Semilla][]) {
    const filas: Fila[] = [
      ...Object.entries(s.habilidades ?? {}).filter(([, v]) => v).map(([id, nombre]) => ({ tipo: 'habilidad' as const, id: Number(id), idioma, nombre, icono: s.iconos?.[id] ?? null })),
      ...Object.entries(s.npcs ?? {}).filter(([, v]) => v).map(([id, nombre]) => ({ tipo: 'npc' as const, id: Number(id), idioma, nombre, icono: null })),
    ];
    await guardar(filas, false);
    const ap = Object.entries(s.apodos ?? {}).filter(([, a]) => a).map(([id, apodo]) => ({ tipo: 'habilidad' as const, refId: Number(id), idioma, apodo, grupoId: null }));
    await db.transaction(async (tx) => {
      await tx.delete(apodos).where(and(eq(apodos.idioma, idioma), isNull(apodos.grupoId)));
      if (ap.length) await tx.insert(apodos).values(ap);
    });
    r.nombres += filas.length; r.apodos += ap.length;
  }
  return r;
}

/** Semilla y descarga directa de questlog.gg para todos los ids. La descarga falla en Vercel (Cloudflare): queda en el resumen. */
export async function actualizarNombres() {
  const semilla = await aplicarSemilla();
  const ids = await idsUsados();
  const resumen: Record<string, unknown> = { semilla };
  for (const idioma of IDIOMAS) {
    try {
      const [S, N] = await Promise.all([
        trpc<Questlog['habilidades']>('combatLog.entities.skills', idioma),
        trpc<{ npc: Record<string, { name?: string }> }>('combatLog.entities.names', idioma).then((x) => x.npc),
      ]);
      const npcs = Object.fromEntries([...ids.n].map((id) => [id, N[id]?.name]));
      const { filas, sinNombre } = filasQuestlog(ids, idioma, { habilidades: S, npcs });
      await guardar(filas, true);
      resumen[idioma] = { nombres: filas.length, sinNombre };
    } catch (e) {
      resumen[idioma] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return resumen;
}
