// GET /api/v1/nombres?idioma=es|en — nombres de habilidades y NPC (questlog.gg + apodos globales), con la misma forma
// que tenía nombres.json. Público: lo usa extraer-raid.ps1 para el nombre del jefe y el slug de la raid.
import { error, json } from '@/lib/api/autenticar';
import { esIdioma } from '@/lib/i18n';
import { nombresPara } from '@/lib/raids/vista';

export async function GET(req: Request) {
  const idioma = new URL(req.url).searchParams.get('idioma') ?? 'es';
  if (!esIdioma(idioma)) return error(400, 'idioma');
  return json(await nombresPara(idioma));
}
