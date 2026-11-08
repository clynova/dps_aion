import { describe, expect, it } from 'vitest';
import {
  ROLES, apareceEnListados, puede, puedeCambiarRol, puedeEditarRaid, puedeExpulsar, puedeInvitarCon, puedeVerRaid,
  slugDesdeNombre, slugGrupoValido, type Accion, type Rol,
} from '@/lib/permisos';

// Matriz esperada (plan, apartado 3.2): si cambia el plan, cambia esta tabla.
const ESPERADO: Record<Accion, Rol[]> = {
  ver_privadas: ['propietario', 'admin', 'publicador', 'miembro'],
  subir_raid: ['propietario', 'admin', 'publicador'],
  editar_raid_ajena: ['propietario', 'admin'],
  invitar: ['propietario', 'admin'],
  expulsar: ['propietario', 'admin'],
  cambiar_rol: ['propietario', 'admin'],
  ajustes: ['propietario', 'admin'],
  borrar_grupo: ['propietario'],
  transferir: ['propietario'],
};

describe('matriz rol × acción', () => {
  for (const [accion, roles] of Object.entries(ESPERADO) as [Accion, Rol[]][]) {
    it(accion, () => {
      for (const rol of ROLES) expect(puede(rol, accion), `${rol} → ${accion}`).toBe(roles.includes(rol));
      expect(puede(null, accion), `sin rol → ${accion}`).toBe(false);
    });
  }
});

describe('raids', () => {
  it('privada: solo miembros; con enlace y pública: cualquiera que llegue', () => {
    expect(puedeVerRaid('privada', null)).toBe(false);
    expect(puedeVerRaid('privada', 'miembro')).toBe(true);
    expect(puedeVerRaid('enlace', null)).toBe(true);
    expect(puedeVerRaid('publica', null)).toBe(true);
  });
  it('listados: las de mis grupos; de los demás, solo públicas de grupos visibles', () => {
    expect(apareceEnListados('enlace', true, null)).toBe(false);
    expect(apareceEnListados('publica', false, null)).toBe(false);
    expect(apareceEnListados('publica', true, null)).toBe(true);
    expect(apareceEnListados('privada', false, 'miembro')).toBe(true);
  });
  it('editar: el admin cualquiera; el publicador solo las suyas; el miembro ninguna', () => {
    expect(puedeEditarRaid('admin', false)).toBe(true);
    expect(puedeEditarRaid('publicador', true)).toBe(true);
    expect(puedeEditarRaid('publicador', false)).toBe(false);
    expect(puedeEditarRaid('miembro', true)).toBe(false);
    expect(puedeEditarRaid(null, true)).toBe(false);
  });
});

describe('roles entre miembros', () => {
  it('nadie toca al propietario ni asigna la propiedad; nadie se cambia a sí mismo', () => {
    expect(puedeCambiarRol('propietario', 'propietario', 'admin', true)).toBe(false);
    expect(puedeCambiarRol('admin', 'propietario', 'miembro', false)).toBe(false);
    expect(puedeCambiarRol('propietario', 'miembro', 'propietario', false)).toBe(false);
    expect(puedeCambiarRol('admin', 'miembro', 'publicador', true)).toBe(false);
  });
  it('el propietario gestiona admins; un admin no', () => {
    expect(puedeCambiarRol('propietario', 'miembro', 'admin', false)).toBe(true);
    expect(puedeCambiarRol('propietario', 'admin', 'miembro', false)).toBe(true);
    expect(puedeCambiarRol('admin', 'miembro', 'admin', false)).toBe(false);
    expect(puedeCambiarRol('admin', 'admin', 'miembro', false)).toBe(false);
    expect(puedeCambiarRol('admin', 'miembro', 'publicador', false)).toBe(true);
  });
  it('publicador y miembro no cambian roles', () => {
    expect(puedeCambiarRol('publicador', 'miembro', 'publicador', false)).toBe(false);
    expect(puedeCambiarRol('miembro', 'miembro', 'publicador', false)).toBe(false);
  });
  it('expulsar', () => {
    expect(puedeExpulsar('admin', 'miembro', false)).toBe(true);
    expect(puedeExpulsar('admin', 'admin', false)).toBe(false);
    expect(puedeExpulsar('propietario', 'admin', false)).toBe(true);
    expect(puedeExpulsar('admin', 'propietario', false)).toBe(false);
    expect(puedeExpulsar('miembro', 'miembro', true)).toBe(true);       // salir del grupo
    expect(puedeExpulsar('propietario', 'propietario', true)).toBe(false); // el propietario no puede irse sin transferir
    expect(puedeExpulsar('publicador', 'miembro', false)).toBe(false);
  });
  it('invitaciones', () => {
    expect(puedeInvitarCon('propietario', 'admin')).toBe(true);
    expect(puedeInvitarCon('admin', 'admin')).toBe(false);
    expect(puedeInvitarCon('admin', 'publicador')).toBe(true);
    expect(puedeInvitarCon('propietario', 'propietario')).toBe(false);
    expect(puedeInvitarCon('publicador', 'miembro')).toBe(false);
  });
});

describe('dirección del grupo', () => {
  it('valida', () => {
    for (const ok of ['cry', 'los-de-cry', 'grupo2026']) expect(slugGrupoValido(ok), ok).toBe(true);
    for (const mal of ['', 'ab', '-cry', 'cry-', 'Cry', 'los--de', 'con espacio', 'ñu', 'api', 'en', 'a'.repeat(41)]) expect(slugGrupoValido(mal), mal).toBe(false);
  });
  it('propone desde el nombre', () => {
    expect(slugDesdeNombre('Los de Cry')).toBe('los-de-cry');
    expect(slugDesdeNombre('  Ñandú  Élite!! ')).toBe('nandu-elite');
  });
});
