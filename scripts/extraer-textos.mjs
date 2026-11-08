// Copia los textos de la web actual (assets/i18n.js, objeto DICT) a lib/i18n/es.json y en.json.
// Mientras la web estática siga viva en main, si cambian textos allí: npm run textos
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../assets/i18n.js', import.meta.url), 'utf8');
const ini = src.indexOf('const DICT = ');
const fin = src.indexOf('\n  const LANGS');
if (ini < 0 || fin < 0) throw new Error('No encuentro DICT en assets/i18n.js');
const literal = src.slice(ini + 'const DICT = '.length, fin).trim().replace(/;$/, '');
const DICT = Function(`"use strict"; return (${literal});`)();

for (const idioma of Object.keys(DICT)) {
  const ordenado = Object.fromEntries(Object.entries(DICT[idioma]).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(new URL(`../lib/i18n/${idioma}.json`, import.meta.url), JSON.stringify(ordenado, null, 2) + '\n');
  console.log(`${idioma}: ${Object.keys(ordenado).length} textos`);
}
