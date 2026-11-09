// Prueba de punta a punta del análisis con IA, contra un DeepSeek SIMULADO (no gasta nada) y la rama dev de Neon.
// Arranca la app ya compilada (npm run build) en el puerto 3001 apuntando al simulador, crea un usuario y un grupo de
// PRUEBA, sube la raid anónima de tests/fixtures y comprueba: análisis automático al subir (es/en, autor deepseek,
// nota de IA), espera de 24 h (429), que un fallo de la IA devuelve la reserva, y el botón en la página. Lo borra todo.
//   node --env-file=.env.local --conditions=react-server --import tsx scripts/probar-ia.mts
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const uid = 'prueba-ia-usuario', grupo = 'prueba-ia', PUERTO = 3001, PUERTO_IA = 3999;
const APP = `http://localhost:${PUERTO}`;
const raid = JSON.parse(readFileSync('tests/fixtures/raid-v2-anonima.json', 'utf8'));

// --- DeepSeek simulado: responde como la API real (formato OpenAI, modo JSON) ---------------------------------
let fallarIA = false, llamadasIA = 0;
const ia = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (c) => (cuerpo += c)).on('end', () => {
    llamadasIA++;
    if (fallarIA) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'fallo simulado' } })); return; }
    const b = JSON.parse(cuerpo) as { messages: { role: string; content: string }[]; response_format?: { type: string } };
    const [sistema, usuario] = b.messages;
    let salida: unknown;
    if (/You are a translator/.test(sistema.content)) {
      const es = JSON.parse(usuario.content);
      salida = { ...es, titular: 'Simulated **English** headline.', recomendaciones: es.recomendaciones.map(() => ({ titulo: 'Test it', texto: 'Simulated text in English.' })),
        jugadores: Object.fromEntries(Object.keys(es.jugadores).map((n) => [n, [`Simulated advice for ${n}: you can do it.`]])) };
    }
    else {
      const g: string[] = JSON.parse(usuario.content).raid.meta.grupo;
      salida = { pendiente: false, titular: 'Titular **simulado** de la IA.', recomendaciones: [{ titulo: 'Probar', texto: 'Texto simulado.' }],
        jugadores: Object.fromEntries(g.map((n) => [n, [`Consejo simulado para ${n}.`]])), notas: [] };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // DeepSeek manda líneas en blanco antes del JSON mientras trabaja (peticiones sin streaming)
    res.end('\n\n' + JSON.stringify({ choices: [{ message: { content: JSON.stringify(salida) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1200, completion_tokens: 300, prompt_cache_hit_tokens: 0 } }));
  });
});
await new Promise<void>((r) => ia.listen(PUERTO_IA, r));

// --- App en el puerto 3001 con la clave falsa y el simulador ------------------------------------------------------
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PUERTO)], {
  env: { ...process.env, DEEPSEEK_API_KEY: 'clave-de-prueba', DEEPSEEK_BASE_URL: `http://localhost:${PUERTO_IA}`, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let registro = ''; app.stdout.on('data', (d) => (registro += d)); app.stderr.on('data', (d) => (registro += d));
for (let i = 0; i < 60 && !(await fetch(APP).then(() => true, () => false)); i++) await new Promise((r) => setTimeout(r, 1000));

async function limpiar() {
  await sql`delete from grupos where slug = ${grupo}`;
  await sql`delete from "user" where id = ${uid}`;
  await sql`delete from jugadores j where not exists (select 1 from raid_jugador rj where rj.jugador_id = j.id)`;
}
await limpiar();
const ses = randomBytes(24).toString('base64url');
await sql`insert into "user" (id, name, email, email_verified) values (${uid}, 'Prueba IA', 'prueba-ia@prueba.invalid', true)`;
await sql`insert into session (id, token, user_id, expires_at, updated_at) values (${'ses-' + uid}, ${ses}, ${uid}, now() + interval '1 hour', now())`;
const [g] = await sql`insert into grupos (slug, nombre, creado_por) values (${grupo}, 'Grupo de prueba IA', ${uid}) returning id`;
await sql`insert into miembros (grupo_id, usuario_id, rol) values (${g.id}, ${uid}, 'propietario')`;
const cookie = encodeURIComponent(`${ses}.${createHmac('sha256', process.env.AUTH_SECRET!).update(ses).digest('base64')}`);
const cab = { Cookie: `__Secure-better-auth.session_token=${cookie}`, 'Content-Type': 'application/json' };
const exigir = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const esperar = async (cond: () => Promise<boolean>, ms = 60_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 1000)); } return false; };

let fallo = '';
try {
  // 1. Subir la raid: se analiza sola (después de los nombres)
  const sub = await fetch(`${APP}/api/v1/grupos/${grupo}/raids?visibilidad=privada`, { method: 'POST', headers: cab, body: JSON.stringify(raid) });
  exigir(sub.status === 201, `la subida devolvió ${sub.status}`);
  const { slug } = await sub.json() as { slug: string };
  const [r] = await sql`select id from raids where grupo_id = ${g.id} and slug = ${slug}`;
  const listo = await esperar(async () => (await sql`select count(*)::int n from analisis where raid_id = ${r.id} and autor = 'deepseek'`)[0].n === 2);
  exigir(listo, 'el análisis automático no llegó en 60 s');
  const filas = await sql`select idioma, contenido from analisis where raid_id = ${r.id} order by idioma`;
  const es = filas.find((f) => f.idioma === 'es')!.contenido, en = filas.find((f) => f.idioma === 'en')!.contenido;
  exigir(Object.keys(es.jugadores).length === raid.meta.grupo.length, 'faltan jugadores en el análisis');
  exigir(es.notas.at(-1).termino === 'Análisis automático' && en.notas.at(-1).termino === 'Automatic analysis', 'falta la nota de análisis automático');
  exigir(en.titular === 'Simulated **English** headline.', 'la versión en inglés no es la traducción');
  const [aud] = await sql`select detalle from auditoria where grupo_id = ${g.id} and accion = 'analisis.ia'`;
  console.log(`✓ al subir, análisis automático en es y en (${llamadasIA} llamadas a la IA, ${aud.detalle.entrada} tokens de entrada; autor deepseek; nota de IA)`);

  // 2. Volver a pedirlo: espera de 24 h
  const otra = await fetch(`${APP}/api/v1/grupos/${grupo}/raids/${slug}/analizar`, { method: 'POST', headers: cab });
  const d = await otra.json() as { disponible: string };
  const horas = (new Date(d.disponible).getTime() - Date.now()) / 3_600_000;
  exigir(otra.status === 429 && horas > 23.9 && horas <= 24, `debería esperar 24 h: ${otra.status} ${JSON.stringify(d)}`);
  console.log(`✓ pedirlo otra vez: 429, disponible en ${horas.toFixed(1)} h`);

  // 3. Pasadas las 24 h, si la IA falla se devuelve la reserva (se puede reintentar)
  await sql`update raids set analisis_ia = now() - interval '25 hours' where id = ${r.id}`;
  fallarIA = true;
  const p = await fetch(`${APP}/api/v1/grupos/${grupo}/raids/${slug}/analizar`, { method: 'POST', headers: cab });
  exigir(p.status === 202, `debería aceptar el análisis manual: ${p.status}`);
  const devuelta = await esperar(async () => {
    const e = await (await fetch(`${APP}/api/v1/grupos/${grupo}/raids/${slug}/analizar`, { headers: cab })).json() as { estado: string };
    return e.estado === 'disponible';
  }, 30_000);
  exigir(devuelta, 'tras el fallo de la IA la reserva no se devolvió');
  console.log('✓ análisis manual con la IA fallando: 202, y la reserva se devuelve (se puede reintentar sin esperar 24 h)');

  // 4. El botón en la página (propietario): disponible → «Analizando…» → la página se recarga con el análisis
  fallarIA = false;
  const nav = await chromium.launch();
  try {
    const ctx = await nav.newContext({ locale: 'es-ES' });
    await ctx.addCookies([{ name: '__Secure-better-auth.session_token', value: cookie, domain: 'localhost', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
    const pg = await ctx.newPage();
    pg.on('dialog', (x) => x.accept());
    await pg.goto(`${APP}/g/${grupo}/raids/${slug}?lang=es`, { waitUntil: 'networkidle' });
    if (!(await pg.getByRole('button', { name: 'Analizar con IA' }).count())) {
      console.log('cabecera:', (await pg.locator('header.rx-head').innerHTML().catch(() => '(sin cabecera)')).slice(0, 1500));
      console.log('url:', pg.url(), '| título:', await pg.title());
    }
    await pg.getByRole('button', { name: 'Analizar con IA' }).click();
    await pg.getByText('Analizando con IA').waitFor({ timeout: 10_000 });
    await pg.getByText('Análisis con IA hecho').waitFor({ timeout: 60_000 }); // tras recargarse sola
    await pg.getByText('Titular simulado de la IA').first().waitFor({ timeout: 10_000 });
    console.log('✓ botón en la página: «Analizar con IA» → «Analizando…» → se recarga con el análisis y avisa de la espera');
    const anon = await (await nav.newContext()).newPage();
    await sql`update raids set visibilidad = 'publica' where id = ${r.id}`;
    await anon.goto(`${APP}/g/${grupo}/raids/${slug}?lang=es`, { waitUntil: 'networkidle' });
    exigir(!(await anon.getByRole('button', { name: 'Analizar con IA' }).count()), 'un visitante sin sesión no debería ver el botón');
    console.log('✓ sin sesión no aparece el botón');
  } finally { await nav.close(); }
} catch (e) {
  fallo = e instanceof Error ? e.message : String(e);
} finally {
  await limpiar();
  app.kill(); ia.close();
}
if (fallo) { console.error(`✗ ${fallo}\n--- registro de la app ---\n${registro.split('\n').filter((l) => /error|ia:|nombres:/i.test(l)).slice(-15).join('\n')}`); process.exit(1); }
console.log('Prueba del análisis con IA completa. Datos de prueba borrados.');
process.exit(0);
