// Límite de raids nuevas por grupo y administradores de la web (lib/limites.ts) contra la base (rama dev).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { like } from 'drizzle-orm';

const conBase = !!process.env.DATABASE_URL;
let db: typeof import('@/lib/db/client')['db'], s: typeof import('@/lib/db/schema'), lim: typeof import('@/lib/limites');
let grupoId = '';
const uid = `prueba-limites-${Date.now().toString(36)}`;

describe.skipIf(!conBase)('límites de uso', () => {
  beforeAll(async () => {
    ({ db } = await import('@/lib/db/client'));
    s = await import('@/lib/db/schema'); lim = await import('@/lib/limites');
    const [g] = await db.insert(s.grupos).values({ slug: uid, nombre: 'Prueba límites' }).returning();
    grupoId = g.id;
    await db.insert(s.user).values({ id: uid, name: 'Prueba', email: `${uid}@example.test`, emailVerified: false });
    await db.insert(s.account).values({ id: uid, accountId: '99887766554433221', providerId: 'discord', userId: uid, updatedAt: new Date() });
  });
  afterAll(async () => {
    await db.delete(s.grupos).where(like(s.grupos.slug, 'prueba-limites-%'));
    await db.delete(s.user).where(like(s.user.id, 'prueba-limites-%'));
  });

  it('cuenta las subidas de los últimos 30 días y dice cuándo hay sitio', async () => {
    const dia = 86_400_000, ahora = Date.now();
    // 2 antiguas (no cuentan), 1 actualización (no cuenta) y LIMITE nuevas, la más antigua hace 20 días
    const filas = [
      ...[40, 31].map((d) => ({ grupoId, accion: 'raid.subir', creada: new Date(ahora - d * dia) })),
      { grupoId, accion: 'raid.actualizar', creada: new Date(ahora - dia) },
      ...Array.from({ length: lim.LIMITE_RAIDS }, (_, i) => ({ grupoId, accion: 'raid.subir', creada: new Date(ahora - (20 - i * 0.1) * dia) })),
    ];
    await db.insert(s.auditoria).values(filas.slice(0, 3 + lim.LIMITE_RAIDS - 1));
    const casi = await lim.usoRaids(grupoId);
    expect(casi).toMatchObject({ usadas: lim.LIMITE_RAIDS - 1, libre: null });
    await db.insert(s.auditoria).values(filas.slice(3 + lim.LIMITE_RAIDS - 1));
    const lleno = await lim.usoRaids(grupoId);
    expect(lleno.usadas).toBe(lim.LIMITE_RAIDS);
    // La plaza se libera cuando la más antigua (hace 20 días) cumple 30: dentro de 10 días
    expect(Math.abs(+lleno.libre! - (ahora + 10 * dia))).toBeLessThan(5_000);
  });

  it('SITE_ADMINS admite el id de Discord o el de usuario', async () => {
    const antes = process.env.SITE_ADMINS;
    try {
      delete process.env.SITE_ADMINS;
      expect(await lim.esAdminSitio(uid)).toBe(false);
      process.env.SITE_ADMINS = ' 111, 99887766554433221 ';
      expect(await lim.esAdminSitio(uid)).toBe(true);
      process.env.SITE_ADMINS = uid;
      expect(await lim.esAdminSitio(uid)).toBe(true);
      process.env.SITE_ADMINS = '111';
      expect(await lim.esAdminSitio(uid)).toBe(false);
      expect(await lim.esAdminSitio(null)).toBe(false);
    } finally { if (antes === undefined) delete process.env.SITE_ADMINS; else process.env.SITE_ADMINS = antes; }
  });
});
