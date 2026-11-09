// POST /api/v1/grupos/:grupo/jugadores/:slug/solicitar — «Solicitar el análisis de mi perfil». Público (sin sesión):
// avisa al webhook de Discord del grupo (lib/solicitudes.ts). Cuerpo opcional { idioma: 'es' | 'en' }: el idioma del
// aviso. Respuestas: 200 { ok, repetida? }, 404 grupo/jugador, 409 sin-webhook, 429 limite, 502 discord.
import { error, json, llamante } from '@/lib/api/autenticar';
import { grupoPorSlug } from '@/lib/db/grupos';
import { esIdioma } from '@/lib/i18n';
import { solicitarAnalisis } from '@/lib/solicitudes';

type Ctx = RouteContext<'/api/v1/grupos/[grupo]/jugadores/[slug]/solicitar'>;
const ESTADO = { 'sin-webhook': 409, jugador: 404, limite: 429, discord: 502 } as const;

export async function POST(req: Request, ctx: Ctx) {
  const { grupo: g, slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return error(400, 'slug');
  const grupo = await grupoPorSlug(g);
  if (!grupo) return error(404, 'grupo');
  const quien = await llamante(req, grupo.id);
  if (!grupo.visible && !quien.rol) return error(404, 'grupo');
  const cuerpo = await req.json().catch(() => ({})) as { idioma?: string };
  const idioma = esIdioma(cuerpo?.idioma) ? cuerpo.idioma : 'es';
  const r = await solicitarAnalisis({ grupo, rol: quien.rol, slug, usuarioId: quien.usuarioId, idioma, origen: new URL(req.url).origin });
  return r.ok ? json(r) : error(ESTADO[r.error], r.error);
}
