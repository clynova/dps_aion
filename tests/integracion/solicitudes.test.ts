// «Solicitar análisis» contra la base (rama dev), con Discord simulado: aviso, espera de 10 minutos, jugador que no
// está en el grupo, grupo sin webhook y fallo de Discord (la solicitud se borra para poder reintentar).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, like, notExists, sql } from 'drizzle-orm';

const enviados: { url: string; texto: string }[] = [];
let discordFalla = false;
vi.mock('@/lib/discord', () => ({
  webhookValido: () => true,
  webhookExiste: async () => true,
  enviarDiscord: async (url: string, texto: string) => { if (discordFalla) return false; enviados.push({ url, texto }); return true; },
}));

const conBase = !!process.env.DATABASE_URL;
const slugGrupo = `prueba-solic-${Date.now().toString(36)}`;
const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/webhook-de-prueba-no-existe_123';

let db: typeof import('@/lib/db/client')['db'], s: typeof import('@/lib/db/schema'), sol: typeof import('@/lib/solicitudes'),
  gr: typeof import('@/lib/db/grupos');
let grupoId = '', usuarioId = '', jugador = '';

describe.skipIf(!conBase)('solicitar análisis', () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET ??= 'secreto-de-prueba-para-vitest-0123456789';
    ({ db } = await import('@/lib/db/client'));
    s = await import('@/lib/db/schema'); sol = await import('@/lib/solicitudes'); gr = await import('@/lib/db/grupos');
    const ing = await import('@/lib/ingest/guardar'), esq = await import('@/lib/ingest/esquema');
    usuarioId = `prueba-solic-${Date.now().toString(36)}`;
    await db.insert(s.user).values({ id: usuarioId, name: 'Prueba', email: `${usuarioId}@example.test`, emailVerified: false });
    const [g] = await db.insert(s.grupos).values({ slug: slugGrupo, nombre: 'Prueba solicitudes', visible: true, visibilidadDefecto: 'publica' }).returning();
    grupoId = g.id;
    await db.insert(s.miembros).values({ grupoId, usuarioId, rol: 'propietario' });
    const v = esq.validarRaid(JSON.parse(readFileSync('tests/fixtures/raid-v2-anonima.json', 'utf8')));
    if (!v.ok) throw new Error('fixture');
    const { raidId } = await ing.guardarRaid({ grupoId, datos: v.datos, origen: 'migracion' });
    await db.update(s.raids).set({ visibilidad: 'publica' }).where(eq(s.raids.id, raidId));
    const [j] = await db.select({ slug: s.jugadores.slug }).from(s.raidJugador).innerJoin(s.jugadores, eq(s.jugadores.id, s.raidJugador.jugadorId))
      .where(eq(s.raidJugador.raidId, raidId)).limit(1);
    jugador = j.slug;
  });
  afterAll(async () => {
    await db.delete(s.grupos).where(like(s.grupos.slug, 'prueba-solic-%'));
    await db.delete(s.user).where(like(s.user.id, 'prueba-solic-%'));
    for (const patron of ['Jugador_', 'Veterano%']) await db.delete(s.jugadores).where(and(like(s.jugadores.nombre, patron),
      notExists(db.select({ x: sql`1` }).from(s.raidJugador).where(eq(s.raidJugador.jugadorId, s.jugadores.id)))));
  });

  const grupo = async () => (await gr.grupoPorSlug(slugGrupo))!;
  const pedir = async (slug = jugador) => sol.solicitarAnalisis({ grupo: await grupo(), rol: null, slug, usuarioId: null, idioma: 'es', origen: 'https://x.test' });

  it('sin webhook no se avisa', async () => {
    expect(await pedir()).toEqual({ ok: false, error: 'sin-webhook' });
  });

  it('solo un admin guarda el webhook, y se guarda cifrado', async () => {
    await expect(gr.guardarWebhook('otro-usuario', grupoId, WEBHOOK)).rejects.toBeInstanceOf(gr.ErrorPermiso);
    await gr.guardarWebhook(usuarioId, grupoId, WEBHOOK);
    const g = await grupo();
    expect(g.discordWebhookCifrado).toBeTruthy();
    expect(g.discordWebhookCifrado).not.toContain('discord');
    expect(gr.webhookDe(g)).toBe(WEBHOOK);
  });

  it('avisa una vez y repite en silencio durante 10 minutos', async () => {
    expect(await pedir()).toEqual({ ok: true });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].url).toBe(WEBHOOK);
    expect(enviados[0].texto).toContain(`https://x.test/jugadores/${jugador}`);
    expect(await pedir()).toEqual({ ok: true, repetida: true });
    expect(enviados).toHaveLength(1);
    const filas = await db.select().from(s.solicitudes).where(eq(s.solicitudes.grupoId, grupoId));
    expect(filas).toHaveLength(1);
    expect(filas[0].avisada).toBeTruthy();
  });

  it('un jugador que no está en el grupo no se acepta', async () => {
    expect(await pedir('no-existe-nadie-asi')).toEqual({ ok: false, error: 'jugador' });
  });

  it('si Discord falla, la solicitud se borra para poder reintentar', async () => {
    await db.delete(s.solicitudes).where(eq(s.solicitudes.grupoId, grupoId));
    discordFalla = true;
    expect(await pedir()).toEqual({ ok: false, error: 'discord' });
    expect(await db.select().from(s.solicitudes).where(eq(s.solicitudes.grupoId, grupoId))).toHaveLength(0);
    discordFalla = false;
    expect(await pedir()).toEqual({ ok: true });
  });

  it('quitar el webhook', async () => {
    await gr.guardarWebhook(usuarioId, grupoId, null);
    expect((await grupo()).discordWebhookCifrado).toBeNull();
  });
});
