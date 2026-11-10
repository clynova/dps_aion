// Vuelca a contenido/juego/estructura.json lo que el módulo «Raids» necesita de los datos del juego:
//   - mazmorras → jefes, de game-data-v2.json de la app de Questlog (%APPDATA%\Questlog\aion-2\);
//   - nombre (es/en) y retrato de cada jefe, de questlog.gg (combatLog.entities.names);
//   - stats con su nombre y descripción (en), de game-data-v2.json.
// Solo funciona en el PC: Vercel no tiene la app de Questlog y Cloudflare le bloquea questlog.gg.
//   node scripts/estructura-juego.mjs [--game-data <ruta>] [--nombres-es <json>] [--nombres-en <json>]
// Lo valida tests/unit/guia.test.ts (esquema en lib/guia/esquema.ts).
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const rutaGameData = opcion('--game-data') ?? join(process.env.APPDATA ?? '', 'Questlog', 'aion-2', 'game-data-v2.json');
const juego = JSON.parse(readFileSync(rutaGameData, 'utf8')).value;
const fechaGameData = statSync(rutaGameData).mtime.toISOString().slice(0, 10);

/** npc de questlog.gg en ese idioma: de un archivo (--nombres-es) o descargado. La respuesta no declara charset: UTF-8 a mano. */
async function npcsQuestlog(idioma) {
  const archivo = opcion(`--nombres-${idioma}`);
  let texto;
  if (archivo) texto = readFileSync(archivo, 'utf8');
  else {
    const url = `https://questlog.gg/aion-2/api/trpc/combatLog.entities.names?input=${encodeURIComponent(JSON.stringify({ language: idioma }))}`;
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`questlog.gg (${idioma}): ${r.status}`);
    texto = new TextDecoder('utf-8').decode(await r.arrayBuffer());
  }
  const j = JSON.parse(texto);
  return (j.result?.data?.json ?? j.result?.data ?? j).npc ?? {};
}

/** Ruta corta bajo Texture/ (como iconoCorto de lib/nombres/actualizar.ts). */
const retratoCorto = (icono) => String(icono ?? '').replace(/^\/?assets\/Game\/UI\/Resource\/Texture\//, '').replace(/\.[^./]+$/, '') || null;
const sinHtml = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\r\n/g, '\n').trim();

const [npcEs, npcEn] = [await npcsQuestlog('es'), await npcsQuestlog('en')];

const mazmorras = juego.dungeons
  .map((d) => ({ id: d.id, jefes: [...d.bosses] }))
  .sort((a, b) => a.id - b.id);

const enMazmorra = new Map();
for (const d of mazmorras) for (const n of d.jefes) enMazmorra.set(n, [...(enMazmorra.get(n) ?? []), d.id]);
const porNpc = new Map(juego.bosses.map((b) => [b.npc, b]));

const jefes = {};
let sinNombreEs = 0;
for (const npc of [...enMazmorra.keys()].sort((a, b) => a - b)) {
  const b = porNpc.get(npc);
  const es = String(npcEs[npc]?.name ?? '').trim();
  const en = String(npcEn[npc]?.name ?? '').trim() || String(b?.name ?? '').trim();
  if (!es) sinNombreEs++;
  jefes[npc] = {
    es: es || en || String(npc),
    en: en || es || String(npc),
    retrato: retratoCorto(npcEn[npc]?.icon ?? npcEs[npc]?.icon),
    mazmorras: enMazmorra.get(npc),
  };
}

const stats = {};
for (const s of [...juego.stats].sort((a, b) => a.id.localeCompare(b.id))) {
  if (s.isDisabled) continue;
  stats[s.id] = { stat: s.statId, categoria: s.category || null, nombre: sinHtml(s.name), descripcion: sinHtml(s.description) };
}

const salida = {
  fuente: 'questlog-game-data',
  game_data: fechaGameData,
  generado: new Date().toISOString().slice(0, 10),
  mazmorras,
  jefes,
  stats,
};

const destino = new URL('../contenido/juego/', import.meta.url);
mkdirSync(destino, { recursive: true });
writeFileSync(new URL('estructura.json', destino), JSON.stringify(salida, null, 1) + '\n');
console.log(`contenido/juego/estructura.json · ${mazmorras.length} mazmorras, ${Object.keys(jefes).length} jefes (${sinNombreEs} sin nombre en español), ${Object.keys(stats).length} stats`);
