// Valida contenido/ (estructura del juego, fuentes y fichas del módulo «Raids»). Va en build y build:vercel: un error para
// el despliegue antes de publicar una ficha mal hecha.
//   node --import tsx scripts/validar-contenido.mts
import { leerContenido } from '@/lib/guia/leer';

const { errores, contenido } = leerContenido();
if (errores.length) {
  console.error(`contenido: ${errores.length} error(es)`);
  for (const e of errores) console.error(`  - ${e}`);
  process.exit(1);
}
const raids = Object.values(contenido!.raids);
console.log(`contenido: ${contenido!.catalogo.fuentes.length} fuentes, ${raids.length} raids, ${raids.reduce((n, r) => n + Object.keys(r.jefes).length, 0)} fichas de jefe`);
