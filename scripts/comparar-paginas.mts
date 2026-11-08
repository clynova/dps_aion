// Compara lo que se VE en la web actual (estática) y en la nueva: abre las mismas páginas en un Chromium sin ventana,
// extrae el texto de cada zona (tiles, tablas, etiquetas de las gráficas, ficha, pestañas…) y lo compara línea a línea.
//   npm run comparar-paginas -- --nueva http://localhost:3000 [--vieja https://dpsaion.vercel.app] [--grupo tetones]
// Sale con código 1 si alguna zona difiere. Los textos quedan en tests/salida-comparacion/ para revisarlos.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const NUEVA = arg('nueva', 'http://localhost:3000'), VIEJA = arg('vieja', 'https://dpsaion.vercel.app'), GRUPO = arg('grupo', 'tetones');
const SALIDA = 'tests/salida-comparacion';
mkdirSync(SALIDA, { recursive: true });

const ZONAS_RAID = ['eyebrow', 'jefe', 'lede', 'otros', 'tiles', 'ch-progreso', 'ch-curva', 'ch-causas', 'ch-casteos', 'tabla', 'ch-mapa', 'analisis', 'notas', 'foot'];
const ZONAS_FICHA = ['f-clase', 'f-nombre', 'f-equipo', 'f-tiles', 'f-reco', 'f-dps', 'f-habilidades', 'f-recibido', 'f-muertes'];
const ZONAS_PERFIL = ['eyebrow', 'nombre', 'lede', 'tiles', 'c-body', 'a-good', 'a-bad', 'a-trend'];
const PESTANAS = ['evolucion', 'supervivencia', 'apoyo', 'dano', 'rotacion', 'raids'];
const ZONAS_PORTADA = ['lede', 'lista', 'lista-jugadores', 'ch-evolucion'];

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1200, height: 900 }, locale: 'es-ES', timezoneId: 'America/Santiago' });

async function textos(page: Page, url: string, zonas: string[], esperar: string, pestanas = false) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(esperar, { timeout: 20_000 });
  await page.waitForTimeout(400);
  const leer = (ids: string[]) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
    const n = document.getElementById(id);
    return [id, n ? (n as HTMLElement).innerText.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim() : '(no existe)'];
  })), ids);
  const r: Record<string, string> = await leer(zonas);
  if (pestanas) for (const p of PESTANAS) {
    await page.click(`#tabs [data-tab="${p}"]`);
    await page.waitForTimeout(250);
    Object.assign(r, Object.fromEntries(Object.entries(await leer([p])).map(([k, v]) => [`pestaña ${k}`, v])));
    if (p === 'supervivencia') Object.assign(r, await leer(['ch-causes']));
  }
  if (pestanas) desempateCausas(r);
  return r;
}

/**
 * Las causas de muerte del perfil (top 8) se desempataban al azar en la web estática (orden de una tabla hash de
 * perfiles.ps1) y ahora de forma fija (fase 4, docs/plan-refactor-next.md). Se comparan sin los nombres, que
 * dependen del desempate: «Qué le mata más» por sus cifras en orden, y en «A vigilar» la frase con sus números.
 */
function desempateCausas(r: Record<string, string>) {
  const causas = r['ch-causes'] ?? '';
  r['pestaña supervivencia'] = (r['pestaña supervivencia'] ?? '').replace(causas, '«causas»');
  r['ch-causes (cifras por puesto)'] = causas.split('\n').filter((l) => /^\d+$/.test(l.trim())).join(',');
  delete r['ch-causes'];
  r['a-bad'] = (r['a-bad'] ?? '').replace(/(«|“)[^»”]*(»|”)/g, '«…»');
}

let fallos = 0;
function comparar(nombre: string, a: Record<string, string>, b: Record<string, string>) {
  writeFileSync(`${SALIDA}/${nombre}.json`, JSON.stringify({ vieja: a, nueva: b }, null, 2));
  const malas = Object.keys(a).filter((k) => a[k] !== b[k]);
  if (!malas.length) { console.log(`✓ ${nombre}`); return; }
  fallos += malas.length;
  console.log(`✗ ${nombre}: ${malas.join(', ')}`);
  for (const k of malas.slice(0, 4)) {
    const la = a[k].split('\n'), lb = (b[k] ?? '').split('\n');
    const i = la.findIndex((l, j) => l !== lb[j]);
    console.log(`    ${k} (línea ${i + 1}): «${la[i] ?? '∅'}» ≠ «${lb[i] ?? '∅'}»`);
  }
}

const page = await contexto.newPage();
const raids = readdirSync('raids').filter((d) => existsSync(`raids/${d}/data.json`)).sort();
for (const idioma of ['es', 'en'] as const) {
  const pre = idioma === 'es' ? '' : '/en';
  for (const slug of raids) {
    const d = JSON.parse(readFileSync(`raids/${slug}/data.json`, 'utf8'));
    const jugador = encodeURIComponent(d.jugadores[0].jugador);
    const a = await textos(page, `${VIEJA}/raids/${slug}/?lang=${idioma}#${jugador}`, [...ZONAS_RAID, ...ZONAS_FICHA], '#tiles .rx-tile');
    const b = await textos(page, `${NUEVA}${pre}/g/${GRUPO}/raids/${slug}?lang=${idioma}#${jugador}`, [...ZONAS_RAID, ...ZONAS_FICHA], '#tiles .rx-tile');
    comparar(`raid ${slug} ${idioma}`, a, b);
  }
  for (const slug of readdirSync('jugadores').filter((s) => existsSync(`jugadores/${s}/data.json`)).sort()) {
    const a = await textos(page, `${VIEJA}/jugadores/${slug}/?lang=${idioma}`, ZONAS_PERFIL, '#tiles .rx-tile', true);
    const b = await textos(page, `${NUEVA}${pre}/jugadores/${slug}?lang=${idioma}`, ZONAS_PERFIL, '#tiles .rx-tile', true);
    comparar(`perfil ${slug} ${idioma}`, a, b);
  }
  const a = await textos(page, `${VIEJA}/?lang=${idioma}`, ZONAS_PORTADA, '#lista .hm-item');
  const b = await textos(page, `${NUEVA}${pre}/g/${GRUPO}?lang=${idioma}`, ZONAS_PORTADA, '#lista .hm-item');
  comparar(`portada → grupo ${idioma}`, a, b);
}
await navegador.close();
console.log(fallos ? `\n${fallos} zonas distintas (detalle en ${SALIDA}/).` : '\nTodas las zonas iguales.');
process.exit(fallos ? 1 : 0);
