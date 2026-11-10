// Lee contenido/ del disco y lo pasa por validarContenido. Para scripts y pruebas (Node); las páginas lo cargarán aparte.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { validarContenido } from './validar';

const json = (ruta: string) => JSON.parse(readFileSync(ruta, 'utf8'));

export function leerContenido(raiz = 'contenido') {
  const dirRaids = join(raiz, 'raids');
  const archivos: Record<string, unknown> = {};
  for (const e of readdirSync(dirRaids, { recursive: true, withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const ruta = join(e.parentPath, e.name);
    const rel = relative(dirRaids, ruta).split(sep).join('/');
    if (rel === 'fuentes.json') continue;
    try { archivos[rel] = json(ruta); } catch (err) { archivos[rel] = { error_json: String(err) }; }
  }
  return validarContenido({
    estructura: json(join(raiz, 'juego', 'estructura.json')),
    catalogo: json(join(dirRaids, 'fuentes.json')),
    archivos,
  });
}
