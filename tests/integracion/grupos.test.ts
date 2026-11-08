// Pruebas contra Postgres de verdad (la rama «dev» de Neon de .env.local). Sin DATABASE_URL se saltan (CI).
// Crean usuarios y grupos con un prefijo propio y lo borran todo al terminar.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray, like } from 'drizzle-orm';

const conBase = !!process.env.DATABASE_URL;
const id = `prueba-${Date.now().toString(36)}`;
const U = { duena: `${id}-duena`, admin: `${id}-admin`, pub: `${id}-pub`, otro: `${id}-otro`, intrusa: `${id}-intrusa` };

// Los módulos que conectan a la base se importan en beforeAll: el cuerpo de un describe saltado se ejecuta igual al
// recoger las pruebas, y sin DATABASE_URL lib/db/client lanza un error (así falló el CI de 305ddc0).
type Db = typeof import('@/lib/db/client')['db'];
let db: Db, s: typeof import('@/lib/db/schema'), g: typeof import('@/lib/db/grupos');

describe.skipIf(!conBase)('grupos contra la base', () => {
  let grupoId = '';
  const slug = `${id}`.slice(0, 40);

  beforeAll(async () => {
    ({ db } = await import('@/lib/db/client'));
    s = await import('@/lib/db/schema');
    g = await import('@/lib/db/grupos');
    await db.insert(s.user).values(Object.values(U).map((uid) => ({ id: uid, name: uid, email: `${uid}@prueba.invalid` })));
  });
  afterAll(async () => {
    await db.delete(s.grupos).where(like(s.grupos.slug, `${id}%`));
    await db.delete(s.user).where(inArray(s.user.id, Object.values(U)));
  });

  it('crear grupo: quien lo crea es propietario; la dirección es única', async () => {
    const gr = await g.crearGrupo(U.duena, 'Grupo de prueba', slug);
    grupoId = gr.id;
    expect(await g.rolEn(grupoId, U.duena)).toBe('propietario');
    await expect(g.crearGrupo(U.otro, 'Otro', slug)).rejects.toMatchObject({ clave: 'slug-ocupado' });
    await expect(g.crearGrupo(U.otro, 'X', 'ok-pero-nombre-corto')).rejects.toMatchObject({ clave: 'nombre' });
  });

  it('un grupo oculto no existe para quien no es miembro', async () => {
    expect(await g.grupoParaVer(slug, U.intrusa)).toBeNull();
    expect(await g.grupoParaVer(slug, null)).toBeNull();
    expect((await g.grupoParaVer(slug, U.duena))?.rol).toBe('propietario');
  });

  it('invitar: solo quien puede, y nunca como propietario', async () => {
    await expect(g.crearInvitacion(U.intrusa, grupoId, { rol: 'miembro', dias: 7, usosMax: null })).rejects.toBeInstanceOf(g.ErrorPermiso);
    await expect(g.crearInvitacion(U.duena, grupoId, { rol: 'propietario', dias: 7, usosMax: null })).rejects.toBeInstanceOf(g.ErrorPermiso);
  });

  it('aceptar una invitación de un uso: entra con su rol y el uso se gasta', async () => {
    const inv = await g.crearInvitacion(U.duena, grupoId, { rol: 'admin', dias: 1, usosMax: 1 });
    expect((await g.aceptarInvitacion(U.admin, inv.codigo)).yaEra).toBe(false);
    expect(await g.rolEn(grupoId, U.admin)).toBe('admin');
    expect(await g.invitacionValida(inv.codigo)).toBeNull();
    await expect(g.aceptarInvitacion(U.otro, inv.codigo)).rejects.toMatchObject({ clave: 'invitacion' });
    expect(await g.rolEn(grupoId, U.otro)).toBeNull();
  });

  it('aceptar dos veces no gasta usos ni cambia el rol', async () => {
    const inv = await g.crearInvitacion(U.admin, grupoId, { rol: 'publicador', dias: null, usosMax: 5 });
    await g.aceptarInvitacion(U.pub, inv.codigo);
    expect((await g.aceptarInvitacion(U.pub, inv.codigo)).yaEra).toBe(true);
    const [fila] = await g.invitacionesActivas(grupoId).then((l) => l.filter((x) => x.codigo === inv.codigo));
    expect(fila.usos).toBe(1);
    expect(await g.rolEn(grupoId, U.pub)).toBe('publicador');
  });

  it('una invitación revocada ya no vale', async () => {
    const inv = await g.crearInvitacion(U.duena, grupoId, { rol: 'miembro', dias: null, usosMax: null });
    await g.revocarInvitacion(U.admin, grupoId, inv.codigo);
    await expect(g.aceptarInvitacion(U.otro, inv.codigo)).rejects.toMatchObject({ clave: 'invitacion' });
  });

  it('roles: el admin no nombra admins; el propietario sí; nadie toca al propietario', async () => {
    await expect(g.cambiarRol(U.admin, grupoId, U.pub, 'admin')).rejects.toBeInstanceOf(g.ErrorPermiso);
    await expect(g.cambiarRol(U.admin, grupoId, U.duena, 'miembro')).rejects.toBeInstanceOf(g.ErrorPermiso);
    await expect(g.cambiarRol(U.pub, grupoId, U.pub, 'admin')).rejects.toBeInstanceOf(g.ErrorPermiso);
    await g.cambiarRol(U.admin, grupoId, U.pub, 'miembro');
    expect(await g.rolEn(grupoId, U.pub)).toBe('miembro');
    await g.cambiarRol(U.duena, grupoId, U.pub, 'admin');
    expect(await g.rolEn(grupoId, U.pub)).toBe('admin');
  });

  it('ajustes: un miembro de fuera o sin permiso no los cambia', async () => {
    await expect(g.actualizarAjustes(U.intrusa, grupoId, { visible: true })).rejects.toBeInstanceOf(g.ErrorPermiso);
    await g.actualizarAjustes(U.admin, grupoId, { visible: true, visibilidadDefecto: 'enlace' });
    const gr = await g.grupoPorSlug(slug);
    expect(gr?.visible).toBe(true);
    expect(gr?.visibilidadDefecto).toBe('enlace');
    expect((await g.grupoParaVer(slug, null))?.rol).toBeNull(); // visible: ahora existe para todos, sin rol
  });

  it('expulsar y salir', async () => {
    await expect(g.expulsar(U.admin, grupoId, U.pub)).rejects.toBeInstanceOf(g.ErrorPermiso); // admin a admin, no
    await expect(g.expulsar(U.duena, grupoId, U.duena)).rejects.toBeInstanceOf(g.ErrorPermiso); // el propietario no se va
    await g.expulsar(U.duena, grupoId, U.pub);
    expect(await g.rolEn(grupoId, U.pub)).toBeNull();
    await g.expulsar(U.admin, grupoId, U.admin); // salir
    expect(await g.rolEn(grupoId, U.admin)).toBeNull();
    expect((await g.miembrosDe(grupoId)).map((m) => m.usuarioId)).toEqual([U.duena]);
  });
});
