// Carga de la base para la ficha de un jefe del módulo «Raids»: las raids públicas de grupos visibles con ese jefe
// como principal (en cualquiera de sus modos), reconstruidas como en la página del jefe de un grupo, y los nombres de
// los ataques. Si la base falla, null: la ficha se lee igual. «Tu grupo en este jefe»: los grupos de quien mira con
// alguna raid de ese jefe que él pueda ver.
import 'server-only';
import { and, count, eq, inArray } from 'drizzle-orm';
import { connection } from 'next/server';
import { db } from '@/lib/db/client';
import { gruposDeUsuario } from '@/lib/db/grupos';
import { grupos, raids } from '@/lib/db/schema';
import type { Idioma } from '@/lib/i18n';
import { apareceEnListados } from '@/lib/permisos';
import type { RaidConGrupo } from './datos-jefe';
import { reconstruirRaid } from '@/lib/raids/reconstruir';
import { nombresPara } from '@/lib/raids/vista';

export async function raidsPublicasDelJefe(npcs: number[], idioma: Idioma) {
  await connection();
  try {
    const filas = await db.select({ id: raids.id, slug: raids.slug, meta: raids.meta }).from(raids).innerJoin(grupos, eq(grupos.id, raids.grupoId))
      .where(and(eq(raids.visibilidad, 'publica'), eq(grupos.visible, true), inArray(raids.npcJefe, npcs)));
    const [datos, nombres] = await Promise.all([Promise.all(filas.map((r) => reconstruirRaid(r.id))), nombresPara(idioma)]);
    const lista: RaidConGrupo[] = filas.flatMap((r, k) => (datos[k] ? [{ slug: r.slug, fecha: (r.meta as { fecha: string }).fecha, datos: datos[k] as unknown as RaidConGrupo['datos'] }] : []));
    return { raids: lista, nombres };
  } catch (e) {
    // Solo el tipo: un fallo de conexión de Neon puede llevar la cadena de conexión en el mensaje
    console.error('datos del jefe de la guía: la base falló', e instanceof Error ? e.name : typeof e);
    return null;
  }
}

/** Grupos de quien mira con raids de ese jefe que ve en sus listados (para enlazar a /g/<grupo>/jefes/<npc>). */
export async function gruposConJefe(usuarioId: string, npcs: number[]) {
  try {
    const mios = await gruposDeUsuario(usuarioId);
    if (!mios.length) return [];
    const filas = await db.select({ grupoId: raids.grupoId, npc: raids.npcJefe, visibilidad: raids.visibilidad, n: count() }).from(raids)
      .where(and(inArray(raids.grupoId, mios.map((g) => g.id)), inArray(raids.npcJefe, npcs)))
      .groupBy(raids.grupoId, raids.npcJefe, raids.visibilidad);
    return mios.flatMap((g) => {
      const suyas = filas.filter((f) => f.grupoId === g.id && apareceEnListados(f.visibilidad, g.visible, g.rol));
      if (!suyas.length) return [];
      const porNpc = new Map<number, number>();
      for (const f of suyas) porNpc.set(f.npc, (porNpc.get(f.npc) ?? 0) + Number(f.n));
      const [npc] = [...porNpc].sort((a, b) => b[1] - a[1])[0];
      return [{ slug: g.slug, nombre: g.nombre, npc, raids: [...porNpc.values()].reduce((s, n) => s + n, 0) }];
    });
  } catch (e) {
    console.error('grupos con el jefe: la base falló', e instanceof Error ? e.name : typeof e);
    return [];
  }
}
