// POST /api/v1/grupos/:grupo/raids/:slug/analizar — pide el análisis automático con IA (DeepSeek). Publicador o más
// (o el token del grupo). Una raid no se vuelve a analizar antes de 24 h: 429 con «disponible». Responde 202 al
// reservar y el análisis sigue en segundo plano (1–3 min); GET devuelve el estado.
import { after } from 'next/server';
import { error, json, llamante } from '@/lib/api/autenticar';
import { iaConfigurada } from '@/lib/analisis/deepseek';
import { analizarRaid, estadoAnalisisIA, reservarAnalisis } from '@/lib/analisis/ia';
import { grupoPorSlug } from '@/lib/db/grupos';
import { puede } from '@/lib/permisos';
import { raidPorSlug } from '@/lib/raids/reconstruir';

export const maxDuration = 300;
type Ctx = RouteContext<'/api/v1/grupos/[grupo]/raids/[slug]/analizar'>;

async function preparar(req: Request, ctx: Ctx) {
  const { grupo: g, slug } = await ctx.params;
  const grupo = await grupoPorSlug(g);
  if (!grupo) return { fallo: error(404, 'grupo') };
  const quien = await llamante(req, grupo.id);
  if (!quien.rol) return { fallo: error(401, 'sin-autenticar') };
  if (!puede(quien.rol, 'subir_raid')) return { fallo: error(403, 'sin-permiso') };
  const raid = await raidPorSlug(grupo.id, slug);
  if (!raid) return { fallo: error(404, 'raid') };
  return { raid, quien };
}

export async function GET(req: Request, ctx: Ctx) {
  const p = await preparar(req, ctx);
  if ('fallo' in p) return p.fallo;
  return json(await estadoAnalisisIA(p.raid.id));
}

export async function POST(req: Request, ctx: Ctx) {
  const p = await preparar(req, ctx);
  if ('fallo' in p) return p.fallo;
  if (!iaConfigurada()) return error(503, 'ia-no-configurada');
  const reserva = await reservarAnalisis(p.raid.id);
  if (!reserva.ok) return error(429, 'espera', { disponible: reserva.disponible?.toISOString() ?? null });
  after(() => analizarRaid(p.raid.id, { origen: 'manual', usuarioId: p.quien.usuarioId, reserva })
    .catch((e) => console.error('analisis ia:', e instanceof Error ? e.message : e)));
  return json({ ok: true, estado: 'en-curso' }, 202);
}
