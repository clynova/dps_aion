// Nombres que el servidor no puede bajar de questlog.gg (Cloudflare bloquea a Vercel; ver lib/nombres/actualizar.ts).
//   GET  /api/v1/grupos/:grupo/nombres — ids de las raids del grupo sin nombre en algún idioma: { habilidades, npcs }.
//   POST /api/v1/grupos/:grupo/nombres — lo que da questlog.gg para esos ids, tal cual:
//        { es: { habilidades: { "<id>": { name, icon } }, npcs: { "<id>": "<nombre en bruto>" } }, en: { … } }
//        Se guardan con el formato de la web (lib/nombres/actualizar.ts) y solo para ids de las raids del grupo.
//   Autenticación: token del grupo (publicar.ps1) o sesión con rol publicador+.
import { revalidatePath } from 'next/cache';
import { error, json, llamante } from '@/lib/api/autenticar';
import { db } from '@/lib/db/client';
import { grupoPorSlug } from '@/lib/db/grupos';
import { auditoria } from '@/lib/db/schema';
import { guardarNombresDelPc, idsSinNombre, type Questlog } from '@/lib/nombres/actualizar';
import { puede } from '@/lib/permisos';

const MAX_BYTES = 2 * 1024 * 1024;

async function permiso(req: Request, slug: string) {
  const grupo = await grupoPorSlug(slug);
  if (!grupo) return { fallo: error(404, 'grupo') } as const;
  const quien = await llamante(req, grupo.id);
  if (!quien.rol) return { fallo: error(401, 'sin-autenticar') } as const;
  if (!puede(quien.rol, 'subir_raid')) return { fallo: error(403, 'sin-permiso') } as const;
  return { grupo, quien } as const;
}

export async function GET(req: Request, { params }: RouteContext<'/api/v1/grupos/[grupo]/nombres'>) {
  const p = await permiso(req, (await params).grupo);
  if ('fallo' in p) return p.fallo;
  return json(await idsSinNombre(p.grupo.id));
}

const esMapa = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export async function POST(req: Request, { params }: RouteContext<'/api/v1/grupos/[grupo]/nombres'>) {
  const p = await permiso(req, (await params).grupo);
  if ('fallo' in p) return p.fallo;
  const texto = await req.text();
  if (texto.length > MAX_BYTES) return error(413, 'demasiado-grande');
  let cuerpo: unknown;
  try { cuerpo = JSON.parse(texto); } catch { return error(400, 'json-invalido'); }
  if (!esMapa(cuerpo)) return error(422, 'formato', { problemas: ['se esperaba { es: {...}, en: {...} }'] });

  const datos: Partial<Record<'es' | 'en', Partial<Questlog>>> = {};
  const problemas: string[] = [];
  for (const idioma of ['es', 'en'] as const) {
    const q = cuerpo[idioma];
    if (q === undefined) continue;
    if (!esMapa(q)) { problemas.push(`${idioma}: no es un objeto`); continue; }
    const habilidades: Questlog['habilidades'] = {}, npcs: Questlog['npcs'] = {};
    if (esMapa(q.habilidades)) for (const [id, v] of Object.entries(q.habilidades)) {
      if (!/^\d{1,12}$/.test(id) || !esMapa(v)) continue;
      habilidades[id] = { name: typeof v.name === 'string' ? v.name : undefined, icon: typeof v.icon === 'string' ? v.icon : null };
    }
    if (esMapa(q.npcs)) for (const [id, v] of Object.entries(q.npcs)) if (/^\d{1,12}$/.test(id) && typeof v === 'string') npcs[id] = v;
    datos[idioma] = { habilidades, npcs };
  }
  if (problemas.length) return error(422, 'formato', { problemas });

  const resumen = await guardarNombresDelPc(p.grupo.id, datos);
  await db.insert(auditoria).values({ grupoId: p.grupo.id, usuarioId: p.quien.usuarioId, accion: 'nombres.subir', ref: null, detalle: { ...resumen, porToken: p.quien.porToken } });
  revalidatePath('/[lang]', 'layout');
  return json({ ok: true, ...resumen });
}
