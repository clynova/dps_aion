// Prueba de punta a punta de la subida desde el navegador (fase 6), contra la app en local y la rama dev de Neon:
// un usuario de PRUEBA, propietario de un grupo de PRUEBA, abre /subir, elige la carpeta de Questlog de este PC,
// calcula una run, la sube y la vuelve a subir. Después compara lo guardado con lo que calcula DuckDB nativo en el PC
// con el mismo db/raid.sql. Lo borra todo al terminar.
//   node --env-file=.env.local --import tsx scripts/probar-subida.mts --run e8e3 [--app http://localhost:3000]
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox } from '@playwright/test';
import { neon } from '@neondatabase/serverless';

const arg = (n: string, d = '') => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = arg('app', 'http://localhost:3000'), PREFIJO_RUN = arg('run');
const QUESTLOG = join(process.env.APPDATA ?? '', 'Questlog', 'aion-2');
const DUCK_PC = arg('duckdb', 'C:/Users/jahnn/OneDrive/Documentos/dps_aion/db/aion.duckdb');
if (!PREFIJO_RUN) { console.error('Falta --run <inicio del id de la run>'); process.exit(2); }
const sql = neon(process.env.DATABASE_URL!);
const uid = 'prueba-subida-usuario', grupo = 'prueba-subida';

async function limpiar() {
  await sql`delete from grupos where slug = ${grupo}`;
  await sql`delete from "user" where id = ${uid}`;
  await sql`delete from jugadores j where not exists (select 1 from raid_jugador rj where rj.jugador_id = j.id)`;
}
await limpiar();
const token = randomBytes(24).toString('base64url');
await sql`insert into "user" (id, name, email, email_verified) values (${uid}, 'Prueba subida', 'prueba-subida@prueba.invalid', true)`;
await sql`insert into session (id, token, user_id, expires_at, updated_at) values (${'ses-' + uid}, ${token}, ${uid}, now() + interval '1 hour', now())`;
const [g] = await sql`insert into grupos (slug, nombre, creado_por) values (${grupo}, 'Grupo de prueba subida', ${uid}) returning id`;
await sql`insert into miembros (grupo_id, usuario_id, rol) values (${g.id}, ${uid}, 'propietario')`;
const cookie = encodeURIComponent(`${token}.${createHmac('sha256', process.env.AUTH_SECRET!).update(token).digest('base64')}`);

let fallo = '';
let nav: Awaited<ReturnType<typeof chromium.launch>> | null = null;
try {
  nav = await (arg('navegador', 'chromium') === 'firefox' ? firefox : chromium).launch();
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 900 }, locale: 'es-ES', timezoneId: 'America/Santiago' });
  await ctx.addCookies([{ name: '__Secure-better-auth.session_token', value: cookie, domain: 'localhost', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  const p = await ctx.newPage();
  const errores: string[] = [];
  p.on('pageerror', (e) => errores.push(e.message));
  const t0 = Date.now();
  await p.goto(`${APP}/g/${grupo}/subir?lang=es`, { waitUntil: 'networkidle' });
  await p.getByText('Elegir carpeta').waitFor({ timeout: 60_000 });
  console.log(`✓ procesador listo (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  await p.locator('input[data-carpeta]').setInputFiles(QUESTLOG);
  const fila = p.locator(`li[data-run^="${PREFIJO_RUN}"]`);
  await fila.waitFor({ timeout: 60_000 });
  console.log(`✓ carpeta leída: ${await p.locator('li[data-run]').count()} runs en la lista`);
  const t1 = Date.now();
  await fila.getByRole('button').click();
  await p.getByText('3. Revisa y sube').waitFor({ timeout: 120_000 });
  console.log(`✓ run calculada en el navegador (${((Date.now() - t1) / 1000).toFixed(1)} s): ${(await p.locator('section[aria-live] h3').textContent())?.trim()}`);
  await p.selectOption('#s-vis', 'privada');
  await p.getByRole('button', { name: 'Subir la raid' }).click();
  await p.getByText('Raid subida.').waitFor({ timeout: 60_000 });
  console.log('✓ subida (nueva)');
  await p.getByRole('button', { name: 'Subir otra' }).click();
  await fila.getByRole('button').click();
  await p.getByText('3. Revisa y sube').waitFor({ timeout: 120_000 });
  await p.getByRole('button', { name: 'Subir la raid' }).click();
  await p.getByText('Raid actualizada').waitFor({ timeout: 60_000 });
  console.log('✓ subida otra vez → actualizada, sin duplicar');
  if (errores.length) throw new Error(`errores en la página: ${errores.join(' | ')}`);

  // Lo guardado frente a DuckDB nativo con el mismo raid.sql y las mismas variables
  const [r] = await sql`select r.id, r.slug, r.origen, r.visibilidad, r.esquema_version, r.sql_version, r.meta, (select count(*) from raids x where x.grupo_id = r.grupo_id)::int n
    from raids r where r.grupo_id = ${g.id}`;
  console.log(`✓ en la base: ${r.n} raid · ${r.slug} · origen ${r.origen} · ${r.visibilidad} · esquema v${r.esquema_version} · sql ${r.sql_version}`);
  const dir = mkdtempSync(join(tmpdir(), 'dps-subida-'));
  const nativo = join(dir, 'nativo.json').replace(/\\/g, '/');
  const guion = join(dir, 'gen.sql');
  const m = r.meta as { slug: string; jefe: string; fecha: string; run: string; npc: number };
  const qq = (s: string) => `'${s.replace(/'/g, "''")}'`;
  writeFileSync(guion, [
    `create temp table raids_b as select * from raids;`,
    `delete from raids where slug = ${qq(m.slug)};`,
    `insert into raids values (${qq(m.slug)}, ${qq(m.run)}, ${m.npc}, ${qq(m.fecha)}::timestamptz, true);`,
    `set variable slug = ${qq(m.slug)}; set variable jefe = ${qq(m.jefe)}; set variable fecha = ${qq(m.fecha)}; set variable extraido = 'x';`,
    `.mode list`, `.headers off`, `.output ${nativo}`, `.read ${join(process.cwd(), 'db', 'raid.sql').replace(/\\/g, '/')}`, `.output`,
  ].join('\n'));
  const duck = process.env.DUCKDB_EXE || execFileSync('powershell', ['-NoProfile', '-Command', "(Get-ChildItem \"$env:LOCALAPPDATA\\Microsoft\\WinGet\\Packages\" -Recurse -Filter duckdb.exe | Select-Object -First 1).FullName"]).toString().trim();
  // copia de la base del PC: así no se toca la de verdad (la raid se inserta en la copia)
  const copia = join(dir, 'copia.duckdb');
  writeFileSync(copia, readFileSync(DUCK_PC));
  execFileSync(duck, [copia, '-bail', '-f', guion]);
  const { compararJson } = await import('@/lib/comparar');
  const { reconstruirRaid } = await import('@/lib/raids/reconstruir');
  const dif = compararJson(JSON.parse(readFileSync(nativo, 'utf8')), await reconstruirRaid(r.id), { ignorar: ['meta.extraido'], sinOrden: ['causas'] });
  if (dif.length) throw new Error(`lo guardado no coincide con DuckDB nativo:\n  ${dif.slice(0, 10).join('\n  ')}`);
  console.log('✓ lo guardado es IGUAL a lo que calcula DuckDB nativo en el PC (0 diferencias)');
} catch (e) {
  fallo = e instanceof Error ? e.message : String(e);
} finally {
  await nav?.close();
  await limpiar();
}
if (fallo) { console.error(`✗ ${fallo}`); process.exit(1); }
console.log('Prueba de subida completa. Datos de prueba borrados.');
process.exit(0);
