// Quién puede hacer qué (plan, apartado 3.2). Funciones puras: las usan las acciones del servidor y las consultas,
// y las prueba tests/unit/permisos.test.ts. Ninguna página decide permisos por su cuenta.

export const ROLES = ['propietario', 'admin', 'publicador', 'miembro'] as const;
export type Rol = (typeof ROLES)[number];
export const VISIBILIDADES = ['privada', 'enlace', 'publica'] as const;
export type Visibilidad = (typeof VISIBILIDADES)[number];

export type Accion =
  | 'ver_privadas'      // ver raids privadas del grupo
  | 'subir_raid'
  | 'editar_raid_ajena' // visibilidad o borrado de raids que subió otro
  | 'invitar'
  | 'expulsar'
  | 'cambiar_rol'
  | 'ajustes'           // visibilidad del grupo, webhook, apodos, tokens
  | 'borrar_grupo'
  | 'transferir';

const MATRIZ: Record<Rol, readonly Accion[]> = {
  propietario: ['ver_privadas', 'subir_raid', 'editar_raid_ajena', 'invitar', 'expulsar', 'cambiar_rol', 'ajustes', 'borrar_grupo', 'transferir'],
  admin: ['ver_privadas', 'subir_raid', 'editar_raid_ajena', 'invitar', 'expulsar', 'cambiar_rol', 'ajustes'],
  publicador: ['ver_privadas', 'subir_raid'],
  miembro: ['ver_privadas'],
};

export const esRol = (s: unknown): s is Rol => typeof s === 'string' && (ROLES as readonly string[]).includes(s);
export const esVisibilidad = (s: unknown): s is Visibilidad => typeof s === 'string' && (VISIBILIDADES as readonly string[]).includes(s);

/** ¿Puede alguien con este rol en el grupo (o sin rol: null) hacer esta acción? */
export function puede(rol: Rol | null | undefined, accion: Accion): boolean {
  return !!rol && MATRIZ[rol].includes(accion);
}

/** Editar una raid: quien la subió (si sigue pudiendo subir) o un admin. */
export function puedeEditarRaid(rol: Rol | null, esSuya: boolean): boolean {
  return puede(rol, 'editar_raid_ajena') || (esSuya && puede(rol, 'subir_raid'));
}

/**
 * Cambiar el rol de otro miembro. Nadie se cambia el rol a sí mismo, nadie toca al propietario y la propiedad no se
 * asigna así (se transfiere aparte). Un admin no puede nombrar ni degradar a otros admins: eso es del propietario.
 */
export function puedeCambiarRol(actor: Rol | null, objetivoActual: Rol, nuevo: Rol, esElMismo: boolean): boolean {
  if (esElMismo || !puede(actor, 'cambiar_rol')) return false;
  if (objetivoActual === 'propietario' || nuevo === 'propietario') return false;
  if (actor === 'admin' && (objetivoActual === 'admin' || nuevo === 'admin')) return false;
  return true;
}

/** Expulsar: mismas reglas que cambiar el rol; uno mismo puede salir del grupo salvo el propietario. */
export function puedeExpulsar(actor: Rol | null, objetivo: Rol, esElMismo: boolean): boolean {
  if (esElMismo) return objetivo !== 'propietario';
  if (!puede(actor, 'expulsar') || objetivo === 'propietario') return false;
  if (actor === 'admin' && objetivo === 'admin') return false;
  return true;
}

/** Rol que se puede dar en una invitación: nunca propietario, y un admin no puede crear admins. */
export function puedeInvitarCon(actor: Rol | null, rol: Rol): boolean {
  if (!puede(actor, 'invitar') || rol === 'propietario') return false;
  return !(actor === 'admin' && rol === 'admin');
}

/**
 * ¿Puede verse esta raid? Pública: todos. Con enlace: quien llega a ella (no aparece en listados). Privada: miembros.
 * En listados y buscador solo salen las públicas de grupos visibles, más todas las de los grupos del usuario.
 */
export function puedeVerRaid(visibilidad: Visibilidad, rol: Rol | null): boolean {
  return visibilidad !== 'privada' || puede(rol, 'ver_privadas');
}
export function apareceEnListados(visibilidad: Visibilidad, grupoVisible: boolean, rol: Rol | null): boolean {
  return puede(rol, 'ver_privadas') || (visibilidad === 'publica' && grupoVisible);
}

/** Dirección del grupo (/g/<slug>): minúsculas, números y guiones; 3 a 40 caracteres; no empieza ni acaba en guion. */
export const SLUG_GRUPO = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVADOS = new Set(['admin', 'api', 'nuevo', 'subir', 'ajustes', 'en', 'es', 'g', 'grupos', 'jugadores', 'raids']);
export const slugGrupoValido = (s: string) => SLUG_GRUPO.test(s) && !s.includes('--') && !RESERVADOS.has(s);

/** Propuesta de slug a partir del nombre («Los de Cry» → «los-de-cry»). */
export function slugDesdeNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}
