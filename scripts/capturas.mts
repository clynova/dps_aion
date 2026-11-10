// Capturas de página completa para comparar el aspecto antes y después de un cambio visual (docs/plan-ui.md, fase 0).
// Por cada ruta, ancho y tema guarda una captura y mide cuántas pantallas ocupa; si la página tiene pestañas (#tabs),
// una captura por pestaña. No toca datos: solo abre páginas.
//   node --import tsx scripts/capturas.mts --out <carpeta> --ruta /g/<grupo>/raids/<slug> [--ruta …]
//        [--base http://localhost:3000] [--anchos 1366,390] [--temas light,dark]
// Las rutas son de un grupo real: pásalas por argumento, no las escribas en el repo.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:3000' },
    out: { type: 'string' },
    ruta: { type: 'string', multiple: true },
    anchos: { type: 'string', default: '1366,390' },
    temas: { type: 'string', default: 'light,dark' },
  },
});
if (!values.out || !values.ruta?.length) {
  console.error('Uso: --out <carpeta> --ruta <ruta> [--ruta …] [--base URL] [--anchos 1366,390] [--temas light,dark]');
  process.exit(1);
}
const ALTO = 900;
const anchos = values.anchos.split(',').map(Number);
const temas = values.temas.split(',') as ('light' | 'dark')[];
mkdirSync(values.out, { recursive: true });

const nombre = (ruta: string) => ruta.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9-]+/gi, '_') || 'inicio';
const filas: string[] = ['ruta\tpestaña\tancho\ttema\talto_px\tpantallas\tscroll_horizontal'];
const navegador = await chromium.launch();
try {
  for (const tema of temas) {
    for (const ancho of anchos) {
      const pagina = await navegador.newPage({ viewport: { width: ancho, height: ALTO }, colorScheme: tema });
      for (const ruta of values.ruta) {
        await pagina.goto(values.base + ruta, { waitUntil: 'networkidle' });
        await pagina.waitForTimeout(1500);
        const pestanas = await pagina.$$eval('#tabs [data-tab]', (bs) => bs.map((b) => (b as HTMLElement).dataset.tab!));
        for (const pestana of pestanas.length ? pestanas : ['']) {
          if (pestana) { await pagina.click(`#tabs [data-tab="${pestana}"]`); await pagina.waitForTimeout(700); await pagina.evaluate(() => scrollTo(0, 0)); }
          const { alto, horizontal } = await pagina.evaluate(() => ({
            alto: document.documentElement.scrollHeight, horizontal: document.documentElement.scrollWidth > innerWidth,
          }));
          const archivo = `${nombre(ruta)}${pestana ? `-${pestana}` : ''}-${ancho}-${tema}.png`;
          await pagina.screenshot({ path: join(values.out, archivo), fullPage: true });
          filas.push([ruta, pestana || '—', ancho, tema, alto, (alto / ALTO).toFixed(1), horizontal ? 'sí' : 'no'].join('\t'));
          console.log(`${archivo}: ${(alto / ALTO).toFixed(1)} pantallas${horizontal ? ' · ¡scroll horizontal!' : ''}`);
        }
      }
      await pagina.close();
    }
  }
} finally {
  await navegador.close();
}
writeFileSync(join(values.out, 'alturas.tsv'), filas.join('\n') + '\n');
console.log(`Hecho: ${filas.length - 1} capturas en ${values.out} (alturas en alturas.tsv)`);
