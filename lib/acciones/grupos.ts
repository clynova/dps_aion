'use server';
// Acciones de servidor de grupos (formularios). Cada una: sesión → validación (Zod) → permisos y datos (lib/db/grupos)
// → revalidar. Devuelven la CLAVE del texto de error; el formulario la traduce (components/Formulario.tsx).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { usuarioActual } from '@/lib/auth/sesion';
import {
  ErrorDatos, ErrorPermiso, aceptarInvitacion, actualizarAjustes, borrarGrupo, cambiarRol, crearGrupo, crearInvitacion,
  expulsar, crearToken, grupoPorSlug, guardarAvisoRaids, guardarWebhook, revocarInvitacion, revocarToken,
} from '@/lib/db/grupos';
import { esIdioma, rutaEn, type Clave, type Idioma } from '@/lib/i18n';
import { ROLES, VISIBILIDADES } from '@/lib/permisos';

export type Resultado = { ok?: boolean; error?: Clave } | null;

const idiomaDe = (f: FormData): Idioma => { const l = String(f.get('lang') ?? ''); return esIdioma(l) ? l : 'es'; };

/** Ejecuta una acción traduciendo los errores conocidos a claves de texto. */
async function intentar(fn: (usuarioId: string) => Promise<void>): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return { error: 'comun.entrarPrimero' };
  try { await fn(u.id); return { ok: true }; }
  catch (e) {
    if (e instanceof ErrorPermiso) return { error: 'comun.sinPermiso' };
    if (e instanceof ErrorDatos) {
      const claves: Record<string, Clave> = { nombre: 'grupos.error.nombre', slug: 'grupos.error.slug', 'slug-ocupado': 'grupos.error.slugOcupado', invitacion: 'unirse.invalida', confirmacion: 'ajustes.borrar.noCoincide', webhook: 'ajustes.webhook.invalido', 'webhook-inexistente': 'ajustes.webhook.inexistente' };
      return { error: claves[e.clave] ?? 'comun.error' };
    }
    if (e instanceof z.ZodError) return { error: 'comun.error' };
    throw e;
  }
}

async function grupoDe(f: FormData) {
  const g = await grupoPorSlug(String(f.get('grupo') ?? ''));
  if (!g) throw new ErrorPermiso();
  return g;
}

export async function accionCrearGrupo(_: Resultado, f: FormData): Promise<Resultado> {
  let slug = '';
  const r = await intentar(async (uid) => {
    const d = z.object({ nombre: z.string(), slug: z.string().trim().toLowerCase() }).parse(Object.fromEntries(f));
    slug = (await crearGrupo(uid, d.nombre, d.slug)).slug;
  });
  if (r?.ok) redirect(rutaEn(idiomaDe(f), `/g/${slug}`));
  return r;
}

export async function accionAjustes(_: Resultado, f: FormData): Promise<Resultado> {
  return intentar(async (uid) => {
    const g = await grupoDe(f);
    const d = z.object({ nombre: z.string(), visibilidadDefecto: z.enum(VISIBILIDADES) }).parse(Object.fromEntries(f));
    await actualizarAjustes(uid, g.id, { nombre: d.nombre, visible: f.get('visible') === 'on', visibilidadDefecto: d.visibilidadDefecto });
    revalidatePath('/[lang]/g/[grupo]', 'layout');
  });
}

export async function accionCrearInvitacion(_: Resultado, f: FormData): Promise<Resultado> {
  return intentar(async (uid) => {
    const g = await grupoDe(f);
    const d = z.object({
      rol: z.enum(ROLES),
      dias: z.enum(['1', '7', '30', 'nunca']),
      usos: z.enum(['1', '5', '25', 'sin']),
    }).parse(Object.fromEntries(f));
    await crearInvitacion(uid, g.id, { rol: d.rol, dias: d.dias === 'nunca' ? null : Number(d.dias), usosMax: d.usos === 'sin' ? null : Number(d.usos) });
    revalidatePath('/[lang]/g/[grupo]/ajustes', 'page');
  });
}

export async function accionRevocarInvitacion(_: Resultado, f: FormData): Promise<Resultado> {
  return intentar(async (uid) => {
    const g = await grupoDe(f);
    await revocarInvitacion(uid, g.id, z.string().min(10).parse(f.get('codigo')));
    revalidatePath('/[lang]/g/[grupo]/ajustes', 'page');
  });
}

export async function accionCambiarRol(_: Resultado, f: FormData): Promise<Resultado> {
  return intentar(async (uid) => {
    const g = await grupoDe(f);
    const d = z.object({ usuario: z.string().min(1), rol: z.enum(ROLES) }).parse(Object.fromEntries(f));
    await cambiarRol(uid, g.id, d.usuario, d.rol);
    revalidatePath('/[lang]/g/[grupo]', 'layout');
  });
}

export async function accionExpulsar(_: Resultado, f: FormData): Promise<Resultado> {
  let salio = false;
  const r = await intentar(async (uid) => {
    const g = await grupoDe(f);
    const objetivo = z.string().min(1).parse(f.get('usuario'));
    await expulsar(uid, g.id, objetivo);
    salio = objetivo === uid;
    revalidatePath('/[lang]/g/[grupo]', 'layout');
  });
  if (r?.ok && salio) redirect(rutaEn(idiomaDe(f), '/mis-grupos'));
  return r;
}

export async function accionAceptarInvitacion(_: Resultado, f: FormData): Promise<Resultado> {
  let slug = '';
  const r = await intentar(async (uid) => {
    slug = (await aceptarInvitacion(uid, z.string().min(10).parse(f.get('codigo')))).slug;
  });
  if (r?.ok) redirect(rutaEn(idiomaDe(f), `/g/${slug}`));
  return r;
}

export type ResultadoToken = { ok?: boolean; error?: Clave; token?: string } | null;

/** Crea un token de publicación; el token en claro vuelve solo en esta respuesta. */
export async function accionCrearToken(_: ResultadoToken, f: FormData): Promise<ResultadoToken> {
  let token = '';
  const r = await intentar(async (uid) => {
    const g = await grupoDe(f);
    token = await crearToken(uid, g.id, z.string().parse(f.get('nombre')));
    revalidatePath('/[lang]/g/[grupo]/ajustes', 'page');
  });
  return r?.ok ? { ok: true, token } : r;
}

/** Borra el grupo (solo el propietario, escribiendo su dirección) y lleva a «Mis grupos». */
export async function accionBorrarGrupo(_: Resultado, f: FormData): Promise<Resultado> {
  const r = await intentar(async (uid) => {
    const g = await grupoDe(f);
    await borrarGrupo(uid, g.id, String(f.get('confirmacion') ?? ''));
    revalidatePath('/[lang]', 'layout');
  });
  if (r?.ok) redirect(rutaEn(idiomaDe(f), '/mis-grupos'));
  return r;
}

export async function accionRevocarToken(_: Resultado, f: FormData): Promise<Resultado> {
  return intentar(async (uid) => {
    const g = await grupoDe(f);
    await revocarToken(uid, g.id, z.uuid().parse(f.get('id')));
    revalidatePath('/[lang]/g/[grupo]/ajustes', 'page');
  });
}

/** Guarda (o, con `quitar`, borra) el webhook de Discord del grupo para «Solicitar análisis». */
export async function accionWebhook(_: Resultado, f: FormData): Promise<Resultado> {
  return intentar(async (uid) => {
    const g = await grupoDe(f);
    await guardarWebhook(uid, g.id, f.get('quitar') ? null : z.string().max(300).parse(f.get('url')));
    revalidatePath('/[lang]/g/[grupo]', 'layout');
  });
}

/** Activa o apaga el resumen de cada raid nueva en el Discord del grupo; el mensaje sale en el idioma de la página. */
export async function accionAvisoRaids(_: Resultado, f: FormData): Promise<Resultado> {
  return intentar(async (uid) => {
    const g = await grupoDe(f);
    await guardarAvisoRaids(uid, g.id, f.get('avisar') === 'on' ? idiomaDe(f) : null);
    revalidatePath('/[lang]/g/[grupo]/ajustes', 'page');
  });
}
