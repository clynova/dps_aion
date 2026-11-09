// Copia los .sql de db/ a lib/procesado/sql.generado.ts para que el navegador ejecute EXACTAMENTE el mismo SQL que el PC.
// `SQL_VERSION` es la huella del SQL que calcula las cifras: viaja con cada raid subida (sql_version).
//   npm run sql        (lo comprueba tests/unit/sql-generado.test.ts: si se olvida, el CI falla)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const leer = (f) => readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const archivos = { esquema: 'esquema.sql', cargar: 'cargar.sql', cargarRuns: 'cargar-runs.sql', vistas: 'vistas.sql', raid: 'raid.sql', runs: 'runs.sql' };
const sql = Object.fromEntries(Object.entries(archivos).map(([k, f]) => [k, leer(f)]));
const version = createHash('sha256').update([sql.cargar, sql.vistas, sql.raid].join('\n--\n')).digest('hex').slice(0, 12);

const salida = `// GENERADO por scripts/generar-sql.mjs desde db/*.sql: no editar a mano (npm run sql).
export const SQL = ${JSON.stringify(sql, null, 2)} as const;

/** Huella de cargar.sql + vistas.sql + raid.sql: con qué versión del cálculo se generó cada raid. */
export const SQL_VERSION = ${JSON.stringify(version)};
`;
writeFileSync(new URL('../lib/procesado/sql.generado.ts', import.meta.url), salida);
console.log(`lib/procesado/sql.generado.ts · versión ${version}`);
