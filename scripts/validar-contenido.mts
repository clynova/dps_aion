// Valida contenido/ (estructura del juego, fuentes y fichas del módulo «Raids») y escribe lib/guia/contenido.generado.json,
// que es lo que leen las páginas. Va en build y build:vercel: un error para el despliegue antes de publicar una ficha
// mal hecha, y el contenido de las páginas siempre sale de los archivos de ese momento.
//   npm run contenido      (tests/unit/guia.test.ts comprueba que el .generado.json está al día)
import { writeFileSync } from 'node:fs';
import { contenidoParaPaginas } from '@/lib/guia/generar';
import { leerContenido, leerNombres } from '@/lib/guia/leer';

const { errores, contenido } = leerContenido();
if (errores.length) {
  console.error(`contenido: ${errores.length} error(es)`);
  for (const e of errores) console.error(`  - ${e}`);
  process.exit(1);
}
writeFileSync('lib/guia/contenido.generado.json', JSON.stringify(contenidoParaPaginas(contenido!, leerNombres()), null, 1) + '\n');
const raids = Object.values(contenido!.raids);
console.log(`contenido: ${contenido!.catalogo.fuentes.length} fuentes, ${raids.length} raids, ${raids.reduce((n, r) => n + Object.keys(r.jefes).length, 0)} fichas de jefe → lib/guia/contenido.generado.json`);
