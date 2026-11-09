// Webhooks de Discord: validar la dirección que pega un admin, comprobar que existe y enviar un mensaje.
// Los mensajes nunca mencionan a nadie (allowed_mentions vacío) y solo llevan datos de la base, no texto de quien pide.
import 'server-only';

/** https://discord.com/api/webhooks/<id>/<token> (también discordapp.com, ptb. y canary.), sin nada detrás. */
const WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{5,25})\/([A-Za-z0-9_-]{20,100})\/?$/;

export const webhookValido = (url: string) => WEBHOOK.test(url.trim());

/** ¿Responde Discord que el webhook existe? (GET del webhook: 200 si existe, 401/404 si no). */
export async function webhookExiste(url: string): Promise<boolean> {
  const r = await fetch(url.trim(), { method: 'GET', signal: AbortSignal.timeout(8000) }).catch(() => null);
  return !!r && r.ok;
}

export async function enviarDiscord(url: string, contenido: string): Promise<boolean> {
  const r = await fetch(url.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'DPS Aion', content: contenido.slice(0, 2000), allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  return !!r && r.ok;
}
