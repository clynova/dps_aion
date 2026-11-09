// GET /api/cron/nombres — refresca los nombres de questlog.gg (cron diario de Vercel, vercel.json). Vercel envía
// «Authorization: Bearer <CRON_SECRET>»; sin CRON_SECRET configurado no se acepta ninguna llamada.
import { error, json } from '@/lib/api/autenticar';
import { actualizarNombres } from '@/lib/nombres/actualizar';

export const maxDuration = 120;

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) return error(401, 'sin-autenticar');
  return json({ ok: true, ...(await actualizarNombres()) });
}
