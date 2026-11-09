// Resumen de cada raid en Discord contra la base (rama dev), con Discord simulado: apagado por defecto, se activa solo
// con webhook, lleva las cifras y el análisis en el idioma guardado, y se apaga al quitar el webhook.
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
const slugGrupo = `prueba-aviso-${Date.now().toString(36)}`;
const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/webhook-de-prueba-no-existe_123';

let db: typeof import('@/lib/db/client')['db'], s: typeof import('@/lib/db/schema'), av: typeof import('@/lib/avisos'),
  gr: typeof import('@/lib/db/grupos');
let grupoId = '', usuarioId = '', raidId = '', slugRaid = '';

describe.skipIf(!conBase)('aviso de raid en Discord', () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET ??= 'secreto-de-prueba-para-vitest-0123456789';
    ({ db } = await import('@/lib/db/client'));
    s = await import('@/lib/db/schema'); av = await import('@/lib/avisos'); gr = await import('@/lib/db/grupos');
    const ing = await import('@/lib/ingest/guardar'), esq = await import('@/lib/ingest/esquema');
    usuarioId = `prueba-aviso-${Date.now().toString(36)}`;
    await db.insert(s.user).values({ id: usuarioId, name: 'Prueba', email: `${usuarioId}@example.test`, emailVerified: false });
    const [g] = await db.insert(s.grupos).values({ slug: slugGrupo, nombre: 'Prueba avisos', visible: true, visibilidadDefecto: 'publica' }).returning();
    grupoId = g.id;
    await db.insert(s.miembros).values({ grupoId, usuarioId, rol: 'propietario' });
    const v = esq.validarRaid(JSON.parse(readFileSync('tests/fixtures/raid-v2-anonima.json', 'utf8')));
    if (!v.ok) throw new Error('fixture');
    ({ raidId, slug: slugRaid } = await ing.guardarRaid({ grupoId, datos: v.datos, origen: 'migracion' }));
  });
  afterAll(async () => {
    await db.delete(s.grupos).where(like(s.grupos.slug, 'prueba-aviso-%'));
    await db.delete(s.user).where(like(s.user.id, 'prueba-aviso-%'));
    for (const patron of ['Jugador_', 'Veterano%']) await db.delete(s.jugadores).where(and(like(s.jugadores.nombre, patron),
      notExists(db.select({ x: sql`1` }).from(s.raidJugador).where(eq(s.raidJugador.jugadorId, s.jugadores.id)))));
  });

  it('el texto: cifras, nombres en vez de ids, tres recomendaciones y el enlace aunque haya que recortar', () => {
    const nombres = { apodos: { '1800300': 'Onda' }, habilidades: {}, npcs: {} };
    const m = av.mensajeRaid({ jefe: 'Jefe', intentos: 10, matado: false, mejorPct: 62.34, muertes: 25, dps: 123456,
      titular: 'Mata **1800300**.', recomendaciones: ['Salir de 1800300', 'Dos', 'Tres', 'Cuatro'] }, 'https://x.test/r', 'es', nombres);
    expect(m).toContain('**Jefe**: 10 intentos');
    expect(m).toContain('62,3 %');
    expect(m).toContain('25 muertes (2,5 por intento)');
    expect(m).toContain('Mata **«Onda»**.');
    expect(m).toContain('• Salir de «Onda»');
    expect(m).toContain('• Tres');
    expect(m).not.toContain('Cuatro');
    expect(m.endsWith('\n\nhttps://x.test/r')).toBe(true);
    const kill = av.mensajeRaid({ jefe: 'Boss', intentos: 3, matado: true, mejorPct: 100, muertes: 1, dps: null }, 'https://x.test/r', 'en');
    expect(kill).toContain('**Boss** defeated in 3 attempts');
    const largo = av.mensajeRaid({ jefe: 'Jefe', intentos: 1, matado: false, mejorPct: 1, muertes: 0, dps: 1, titular: 'x'.repeat(3000) }, 'https://x.test/r', 'es');
    expect(largo.length).toBeLessThanOrEqual(2000);
    expect(largo.endsWith('…\n\nhttps://x.test/r')).toBe(true);
  });

  it('apagado por defecto, y sin webhook no se puede activar', async () => {
    expect(await av.avisarRaid(raidId, 'https://x.test')).toEqual({ ok: false, motivo: 'desactivado' });
    await expect(gr.guardarAvisoRaids(usuarioId, grupoId, 'es')).rejects.toBeInstanceOf(gr.ErrorDatos);
    await expect(gr.guardarAvisoRaids('otro-usuario', grupoId, null)).rejects.toBeInstanceOf(gr.ErrorPermiso);
    expect(enviados).toHaveLength(0);
  });

  it('activado: manda las cifras y el enlace, en el idioma guardado', async () => {
    await gr.guardarWebhook(usuarioId, grupoId, WEBHOOK);
    await gr.guardarAvisoRaids(usuarioId, grupoId, 'en');
    expect(await av.avisarRaid(raidId, 'https://x.test')).toEqual({ ok: true });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].url).toBe(WEBHOOK);
    expect(enviados[0].texto).toMatch(/attempts/);
    expect(enviados[0].texto).not.toContain('For next time');
    expect(enviados[0].texto.endsWith(`https://x.test/en/g/${slugGrupo}/raids/${slugRaid}`)).toBe(true);
  });

  it('con análisis lleva el titular y las recomendaciones (el español si falta el del idioma)', async () => {
    await db.insert(s.analisis).values({ raidId, idioma: 'es', autor: 'prueba', contenido: { pendiente: false, titular: 'Titular de prueba.', recomendaciones: [{ titulo: 'Primera', texto: 'x' }] } });
    expect(await av.avisarRaid(raidId, 'https://x.test')).toEqual({ ok: true });
    expect(enviados[1].texto).toContain('Titular de prueba.');
    expect(enviados[1].texto).toContain('For next time:\n• Primera');
  });

  it('si Discord falla lo dice, y quitar el webhook apaga el aviso', async () => {
    discordFalla = true;
    expect(await av.avisarRaid(raidId, 'https://x.test')).toEqual({ ok: false, motivo: 'discord' });
    discordFalla = false;
    await gr.guardarWebhook(usuarioId, grupoId, null);
    expect((await gr.grupoPorSlug(slugGrupo))!.avisoRaids).toBeNull();
    expect(await av.avisarRaid(raidId, 'https://x.test')).toEqual({ ok: false, motivo: 'desactivado' });
  });
});
