// Ida y vuelta contra la base (rama dev): cada raid publicada (v1) y la del formato nuevo (v2, anonimizada) se guarda,
// se reconstruye y tiene que salir IGUAL que el archivo original. Guardarla otra vez no cambia nada.
// Solo se permite que las causas empatadas en el mismo segundo salgan en otro orden (como en raid.sql).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, like, notExists, sql } from 'drizzle-orm';
import { compararJson } from '@/lib/comparar';

const conBase = !!process.env.DATABASE_URL;
const slugGrupo = `prueba-ingest-${Date.now().toString(36)}`;
const leer = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const archivos = [
  ...readdirSync('raids').filter((d) => existsSync(`raids/${d}/data.json`)).map((d) => `raids/${d}/data.json`),
  'tests/fixtures/raid-v2-anonima.json',
];
const OPC = { ignorar: [], sinOrden: ['causas'] };

type M = typeof import('@/lib/db/client');
let db: M['db'], s: typeof import('@/lib/db/schema'), ing: typeof import('@/lib/ingest/guardar'), rec: typeof import('@/lib/raids/reconstruir'),
  esq: typeof import('@/lib/ingest/esquema');
let grupoId = '';

describe.skipIf(!conBase)('ingesta y reconstrucción', () => {
  beforeAll(async () => {
    ({ db } = await import('@/lib/db/client'));
    s = await import('@/lib/db/schema'); ing = await import('@/lib/ingest/guardar'); rec = await import('@/lib/raids/reconstruir'); esq = await import('@/lib/ingest/esquema');
    const [g] = await db.insert(s.grupos).values({ slug: slugGrupo, nombre: 'Prueba ingesta' }).returning();
    grupoId = g.id;
  });
  afterAll(async () => {
    await db.delete(s.grupos).where(like(s.grupos.slug, 'prueba-ingest-%'));
    // Jugadores del fixture anónimo que no estén en ninguna otra raid
    await db.delete(s.jugadores).where(and(like(s.jugadores.nombre, 'Jugador_'),
      notExists(db.select({ x: sql`1` }).from(s.raidJugador).where(eq(s.raidJugador.jugadorId, s.jugadores.id)))));
  });

  it.each(archivos)('%s: se guarda y se reconstruye igual', async (archivo) => {
    const original = leer(archivo);
    const v = esq.validarRaid(original);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const g = await ing.guardarRaid({ grupoId, datos: v.datos, origen: 'migracion' });
    expect(g.nueva).toBe(true);
    const vuelta = await rec.reconstruirRaid(g.raidId);
    expect(compararJson(original, vuelta, OPC)).toEqual([]);

    // Idempotente: guardar otra vez la misma raid actualiza la misma fila y no cambia nada
    const g2 = await ing.guardarRaid({ grupoId, datos: v.datos, origen: 'migracion' });
    expect(g2.raidId).toBe(g.raidId);
    expect(g2.nueva).toBe(false);
    expect(g2.filas).toBe(g.filas);
    expect(compararJson(original, await rec.reconstruirRaid(g2.raidId), OPC)).toEqual([]);
  });

  it('las raids quedan con la visibilidad por defecto del grupo y su huella', async () => {
    const filas = await db.select({ vis: s.raids.visibilidad, huella: s.raids.huella }).from(s.raids).where(eq(s.raids.grupoId, grupoId));
    expect(filas.length).toBe(archivos.length);
    expect(new Set(filas.map((f) => f.vis))).toEqual(new Set(['privada']));
    expect(filas.every((f) => /^[0-9a-f]{32}$/.test(f.huella ?? ''))).toBe(true);
  });
});
