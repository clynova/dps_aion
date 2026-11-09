// Prueba de punta a punta de la publicación desde el PC (fase 7), contra la app en local y la rama dev de Neon:
// un usuario de PRUEBA, propietario de un grupo de PRUEBA, crea un token en Ajustes; tools/publicar.ps1 extrae una run
// de una COPIA de la base del PC y la publica con ese token (dos veces: nueva y actualizada), sube un análisis y un
// perfil, y al revocar el token la web deja de aceptarlo. Lo borra todo al terminar. El token no se imprime.
//   node --env-file=.env.local --conditions=react-server --import tsx scripts/probar-publicar.mts --run e8e3 [--app http://localhost:3000]
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { neon } from '@neondatabase/serverless';

const arg = (n: string, d = '') => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = arg('app', 'http://localhost:3000'), PREFIJO_RUN = arg('run');
const DUCK_PC = arg('duckdb', 'C:/Users/jahnn/OneDrive/Documentos/dps_aion/db/aion.duckdb');
if (!PREFIJO_RUN) { console.error('Falta --run <inicio del id de la run>'); process.exit(2); }
const sql = neon(process.env.DATABASE_URL!);
const uid = 'prueba-publicar-usuario', grupo = 'prueba-publicar';

async function limpiar() {
  await sql`delete from grupos where slug = ${grupo}`;
  await sql`delete from "user" where id = ${uid}`;
  await sql`delete from jugadores j where not exists (select 1 from raid_jugador rj where rj.jugador_id = j.id)`;
}
await limpiar();
const ses = randomBytes(24).toString('base64url');
await sql`insert into "user" (id, name, email, email_verified) values (${uid}, 'Prueba publicar', 'prueba-publicar@prueba.invalid', true)`;
await sql`insert into session (id, token, user_id, expires_at, updated_at) values (${'ses-' + uid}, ${ses}, ${uid}, now() + interval '1 hour', now())`;
const [g] = await sql`insert into grupos (slug, nombre, creado_por) values (${grupo}, 'Grupo de prueba publicar', ${uid}) returning id`;
await sql`insert into miembros (grupo_id, usuario_id, rol) values (${g.id}, ${uid}, 'propietario')`;
const cookie = encodeURIComponent(`${ses}.${createHmac('sha256', process.env.AUTH_SECRET!).update(ses).digest('base64')}`);

const dir = mkdtempSync(join(tmpdir(), 'dps-publicar-'));
const copia = join(dir, 'copia.duckdb');
writeFileSync(copia, readFileSync(DUCK_PC)); // la run se inserta en la copia, no en la base de verdad

let token = '';
function publicar(...args: string[]) {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/publicar.ps1', ...args], {
    encoding: 'utf8', env: { ...process.env, DPS_AION_API: APP, DPS_AION_GRUPO: grupo, DPS_AION_TOKEN: token },
  });
  return { codigo: r.status, salida: `${r.stdout}\n${r.stderr}`.replaceAll(token || '\u0000', '«token»') };
}
const exigir = (cond: unknown, msg: string, extra = '') => { if (!cond) throw new Error(`${msg}${extra ? `\n${extra}` : ''}`); };

let fallo = '';
let nav: Awaited<ReturnType<typeof chromium.launch>> | null = null;
try {
  nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 900 }, locale: 'es-ES' });
  await ctx.addCookies([{ name: '__Secure-better-auth.session_token', value: cookie, domain: 'localhost', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  const p = await ctx.newPage();
  const errores: string[] = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('dialog', (d) => d.accept());

  // 1. Crear el token en Ajustes
  await p.goto(`${APP}/g/${grupo}/ajustes?lang=es`, { waitUntil: 'networkidle' });
  await p.getByRole('heading', { name: 'Tokens para publicar desde el PC' }).waitFor({ timeout: 30_000 });
  exigir(await p.getByText('No hay tokens activos.').isVisible(), 'debería empezar sin tokens');
  await p.fill('#t-nombre', 'PC de prueba');
  await p.getByRole('button', { name: 'Crear token' }).click();
  await p.locator('[data-token]').waitFor({ timeout: 30_000 });
  token = (await p.locator('[data-token]').textContent())?.trim() ?? '';
  exigir(/^dps_[A-Za-z0-9_-]{40,}$/.test(token), 'el token mostrado no tiene el formato dps_…');
  await p.getByText('PC de prueba').first().waitFor();
  exigir(await p.getByText('sin usar').isVisible(), 'el token nuevo debería salir «sin usar»');
  const [enBase] = await sql`select count(*)::int n, bool_and(hash <> ${token}) sin_claro from tokens_api where grupo_id = ${g.id}`;
  exigir(enBase.n === 1 && enBase.sin_claro, 'en la base debería haber 1 token guardado solo como hash');
  console.log('✓ token creado en Ajustes (se muestra una vez; en la base solo su hash)');

  // 2. Publicar la run desde el PC, dos veces
  const una = publicar('-Run', PREFIJO_RUN, '-BaseDatos', copia, '-Visibilidad', 'privada');
  exigir(una.codigo === 0 && una.salida.includes('Raid publicada'), 'publicar.ps1 no publicó la raid', una.salida);
  const otra = publicar('-Run', PREFIJO_RUN, '-BaseDatos', copia);
  exigir(otra.codigo === 0 && otra.salida.includes('Raid actualizada'), 'la segunda vez debería actualizarla', otra.salida);
  console.log('✓ publicar.ps1: raid publicada y, la segunda vez, actualizada sin duplicar');

  const [r] = await sql`select r.id, r.slug, r.run_id, r.origen, r.visibilidad, r.esquema_version, r.sql_version, (select count(*) from raids x where x.grupo_id = r.grupo_id)::int n
    from raids r where r.grupo_id = ${g.id}`;
  const { SQL_VERSION } = await import('@/lib/procesado/sql.generado');
  exigir(r.n === 1 && r.origen === 'pc' && r.visibilidad === 'privada' && r.esquema_version === 2, `raid guardada inesperada: ${JSON.stringify(r)}`);
  exigir(r.sql_version === SQL_VERSION, `sql_version ${r.sql_version} distinta de la del navegador ${SQL_VERSION}`);
  console.log(`✓ en la base: ${r.slug} · origen pc · privada (se conserva al actualizar) · esquema v2 · sql ${r.sql_version} (= navegador)`);

  const extraido = JSON.parse(readFileSync(join(tmpdir(), 'dps-aion', `${r.slug}.json`), 'utf8'));
  const { compararJson } = await import('@/lib/comparar');
  const { reconstruirRaid } = await import('@/lib/raids/reconstruir');
  const dif = compararJson(extraido, await reconstruirRaid(r.id), { ignorar: ['meta.extraido'], sinOrden: ['causas'] });
  exigir(!dif.length, 'lo guardado no coincide con el JSON extraído', dif.slice(0, 10).join('\n'));
  console.log('✓ lo guardado es IGUAL al JSON que extrajo el PC (0 diferencias)');

  // 3. Análisis y perfil de Claude: archivos de prueba en carpetas con el slug (publicar.ps1 lo saca de la carpeta)
  const { slugJugador } = await import('@/lib/ingest/huella');
  const jug = slugJugador(extraido.meta.grupo[0]);
  const escribir = (sub: string, archivo: string, o: unknown) => {
    mkdirSync(join(dir, sub), { recursive: true });
    writeFileSync(join(dir, sub, archivo), JSON.stringify(o), 'utf8');
    return join(dir, sub, archivo);
  };
  const titular = (i: string) => ({ pendiente: false, titular: `Prueba de publicación desde el PC (${i}): ñandú, acción.`, recomendaciones: [{ titulo: 'Probar', texto: 'Texto de prueba.' }], jugadores: {}, notas: [] });
  const anaEs = escribir(r.slug, 'analisis.json', titular('es')), anaEn = escribir(r.slug, 'analisis.en.json', titular('en'));
  const ana = publicar('-Analisis', `${anaEs},${anaEn}`);
  exigir(ana.codigo === 0, 'no se pudo subir el análisis', ana.salida);
  const perfil = (i: string) => ({ actualizado: '2026-11-08', raids: 1, resumen: `Perfil de prueba (${i}).`, fortalezas: ['Una.'], mejorar: ['Otra.'], recomendaciones: ['Más.'] });
  const per = publicar('-Perfil', `${escribir(jug, 'perfil.json', perfil('es'))},${escribir(jug, 'perfil.en.json', perfil('en'))}`);
  exigir(per.codigo === 0, 'no se pudo subir el perfil', per.salida);
  const mal = publicar('-Perfil', escribir('no-existe-xyz', 'perfil.json', perfil('es')));
  exigir(mal.codigo === 1 && mal.salida.includes('no existe'), 'un perfil de alguien que no está en el grupo debería rechazarse', mal.salida);
  const [t] = await sql`select (select count(*) from analisis where raid_id = ${r.id})::int a,
    (select count(*) from perfil_texto where grupo_id = ${g.id})::int p,
    (select contenido->>'titular' from analisis where raid_id = ${r.id} and idioma = 'es') titular`;
  exigir(t.a === 2 && t.p === 2, `deberían quedar 2 análisis y 2 perfiles: ${JSON.stringify(t)}`);
  exigir(t.titular === titular('es').titular, `las tildes no llegaron bien: ${t.titular}`);
  await p.goto(`${APP}/g/${grupo}/raids/${r.slug}?lang=es`, { waitUntil: 'networkidle' });
  await p.getByText('Prueba de publicación desde el PC (es)', { exact: false }).first().waitFor({ timeout: 30_000 });
  console.log(`✓ análisis (es/en) y perfil de ${jug} (es/en) subidos con el token, tildes intactas; se ve en la página de la raid; un jugador ajeno al grupo se rechaza`);

  // 4. Revocar el token: la web deja de aceptarlo
  await p.goto(`${APP}/g/${grupo}/ajustes?lang=es`, { waitUntil: 'networkidle' });
  exigir(await p.getByText(/último uso:/).isVisible(), 'el token debería mostrar su último uso');
  await p.getByRole('button', { name: 'Revocar' }).last().click();
  await p.getByText('No hay tokens activos.').waitFor({ timeout: 30_000 });
  const rev = publicar('-Run', PREFIJO_RUN, '-BaseDatos', copia);
  exigir(rev.codigo === 1 && rev.salida.includes('token no vale'), 'con el token revocado debería fallar con «el token no vale»', rev.salida);
  console.log('✓ token revocado en Ajustes: publicar.ps1 falla con un mensaje claro');
  if (errores.length) throw new Error(`errores en la página: ${errores.join(' | ')}`);
} catch (e) {
  fallo = e instanceof Error ? e.message : String(e);
} finally {
  await nav?.close();
  await limpiar();
}
if (fallo) { console.error(`✗ ${fallo}`); process.exit(1); }
console.log('Prueba de publicación completa. Datos de prueba borrados.');
process.exit(0);
