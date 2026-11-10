// Cifras «de nuestros datos» para el módulo «Raids»: cuántas noches, intentos y kills hay de cada jefe en la web.
// Solo cuentan las raids que cualquiera ve en los listados (raid pública de un grupo visible) y solo se dan totales,
// sin nombres de grupos ni de jugadores. Un jefe cuenta tanto si fue el principal de la raid como uno de los otros
// (raid_otros: el Reactor y Rahu en una noche de Ludra).
import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { connection } from 'next/server';
import { db } from '@/lib/db/client';
import { grupos, raidOtros, raids } from '@/lib/db/schema';
import { sumarCifras, type CifrasJefe } from './sumar-cifras';

export type { CifrasJefe };

/**
 * claves: etiqueta → npc que suma (p. ej. un jefe en Normal y Difícil, o todos los de una raid).
 * Devuelve las cifras de cada etiqueta (sin raids, no está en el mapa), o null si la base falla: la guía se lee igual.
 */
export async function cifrasPublicas(claves: Record<string, number[]>): Promise<Map<string, CifrasJefe> | null> {
  const npcs = [...new Set(Object.values(claves).flat())];
  if (!npcs.length) return new Map();
  await connection(); // cifras al día en cada visita, no en el build
  const visible = and(eq(raids.visibilidad, 'publica'), eq(grupos.visible, true));
  try {
    const [principales, otros] = await Promise.all([
      db.select({ npc: raids.npcJefe, grupo: raids.grupoId, raid: raids.id, intentos: raids.intentos, matado: raids.matado, fecha: raids.fecha })
        .from(raids).innerJoin(grupos, eq(grupos.id, raids.grupoId))
        .where(and(visible, inArray(raids.npcJefe, npcs))),
      db.select({ npc: raidOtros.npc, grupo: raids.grupoId, raid: raids.id, intentos: raidOtros.intentos, matado: raidOtros.matado, fecha: raids.fecha })
        .from(raidOtros).innerJoin(raids, eq(raids.id, raidOtros.raidId)).innerJoin(grupos, eq(grupos.id, raids.grupoId))
        .where(and(visible, inArray(raidOtros.npc, npcs), sql`${raidOtros.npc} <> ${raids.npcJefe}`)),
    ]);
    return sumarCifras([...principales, ...otros], claves);
  } catch (e) {
    // Solo el tipo: un fallo de conexión de Neon puede llevar la cadena de conexión en el mensaje
    console.error('cifras públicas de la guía: la base falló', e instanceof Error ? e.name : typeof e);
    return null;
  }
}
