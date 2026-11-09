// Cliente mínimo de la API de DeepSeek (formato OpenAI: POST /chat/completions) en modo JSON.
// Variables de entorno (solo en el servidor):
//   DEEPSEEK_API_KEY        obligatoria
//   DEEPSEEK_MODEL          deepseek-flash (por defecto) o deepseek-v4-pro
//   DEEPSEEK_RAZONAMIENTO   no (por defecto) | low | high | max — el «thinking» de DeepSeek: mejor análisis, más lento
//   DEEPSEEK_BASE_URL       https://api.deepseek.com
// Según su documentación (9/11/2026): en modo JSON el prompt debe incluir la palabra «json» y un ejemplo, y la
// respuesta puede llegar vacía o cortada por max_tokens: aquí se trata como error y quien llama reintenta.
import 'server-only';

export type Mensaje = { role: 'system' | 'user' | 'assistant'; content: string };
export type Uso = { entrada: number; salida: number; cache: number };
export type RespuestaIA = { json: unknown; uso: Uso; modelo: string };

export class ErrorIA extends Error {
  constructor(public motivo: 'sin-clave' | 'http' | 'vacia' | 'json' | 'cortada', mensaje: string, public estado?: number) { super(mensaje); }
}

export const iaConfigurada = () => !!process.env.DEEPSEEK_API_KEY;

export async function deepseekJson(mensajes: Mensaje[], opciones: { maxTokens?: number; fetch?: typeof fetch } = {}): Promise<RespuestaIA> {
  const clave = process.env.DEEPSEEK_API_KEY;
  if (!clave) throw new ErrorIA('sin-clave', 'Falta DEEPSEEK_API_KEY');
  const modelo = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  const razonamiento = process.env.DEEPSEEK_RAZONAMIENTO || 'no';
  const cuerpo: Record<string, unknown> = {
    model: modelo,
    messages: mensajes,
    response_format: { type: 'json_object' },
    max_tokens: opciones.maxTokens ?? 16_000,
    stream: false,
  };
  if (razonamiento === 'no') { cuerpo.thinking = { type: 'disabled' }; cuerpo.temperature = 0.4; }
  else { cuerpo.thinking = { type: 'enabled' }; cuerpo.reasoning_effort = razonamiento; }

  const r = await (opciones.fetch ?? fetch)(`${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(280_000),
    cache: 'no-store',
  });
  // Sin streaming, DeepSeek manda líneas en blanco mientras piensa: JSON.parse las admite delante del objeto
  const texto = await r.text();
  let datos: { choices?: { message?: { content?: string }; finish_reason?: string }[]; usage?: Record<string, number>; error?: { message?: string } } = {};
  try { datos = JSON.parse(texto); } catch { /* se trata abajo */ }
  if (!r.ok) throw new ErrorIA('http', `DeepSeek ${r.status}: ${datos.error?.message ?? texto.slice(0, 200)}`, r.status);
  const opcion = datos.choices?.[0];
  if (opcion?.finish_reason === 'length') throw new ErrorIA('cortada', 'La respuesta de DeepSeek se cortó (max_tokens)');
  const contenido = (opcion?.message?.content ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  if (!contenido) throw new ErrorIA('vacia', 'DeepSeek devolvió una respuesta vacía');
  let json: unknown;
  try { json = JSON.parse(contenido); } catch { throw new ErrorIA('json', 'DeepSeek no devolvió JSON válido'); }
  const u = datos.usage ?? {};
  return { json, modelo, uso: { entrada: u.prompt_tokens ?? 0, salida: u.completion_tokens ?? 0, cache: u.prompt_cache_hit_tokens ?? 0 } };
}
