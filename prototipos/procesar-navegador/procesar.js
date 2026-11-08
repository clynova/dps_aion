// Prueba de concepto (fase 1 del plan): ejecutar en el navegador, con DuckDB-WASM, los mismos .sql que usa el PC
// (db/esquema.sql, cargar.sql, cargar-runs.sql, vistas.sql, raid.sql) sobre los archivos de la carpeta de Questlog,
// y comparar el JSON con el de DuckDB nativo. Imita tools/cargar-db.ps1 + tools/extraer-raid.ps1.
import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm';

const $ = (id) => document.getElementById(id);
const log = (s) => { $('estado').textContent = s; };
const tiempos = [];
const marca = (paso, t0) => { const ms = performance.now() - t0; tiempos.push(`${paso}: ${(ms / 1000).toFixed(2)} s`); $('tiempos').textContent = tiempos.join('\n'); return performance.now(); };
const texto = (url) => fetch(url, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(url); return r.text(); });

// --- DuckDB-WASM (corre en su propio Web Worker) ---
const t0 = performance.now();
const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), new Worker(workerUrl));
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
const conn = await db.connect();
const filas = async (sql) => (await conn.query(sql)).toArray().map((r) => r.toJSON());
const version = (await filas('select version() v'))[0].v;
const [esquema, cargar, cargarRuns, cargarWeb, vistas, raidSql, nombresEs, nombresEn] = await Promise.all(
  ['db/esquema.sql', 'db/cargar.sql', 'db/cargar-runs.sql', 'db/cargar-web.sql', 'db/vistas.sql', 'db/raid.sql', 'nombres.json', 'nombres.en.json'].map((f) => texto('/' + f)));
await db.registerFileText('nombres.json', nombresEs);
await db.registerFileText('nombres.en.json', nombresEn);
await conn.query(esquema);
// De cargar-web.sql solo los nombres: las raids publicadas no hacen falta aquí
await conn.query(cargarWeb.slice(cargarWeb.indexOf('delete from nombres;')));
marca(`DuckDB-WASM ${version} listo`, t0);
log(`DuckDB ${version} listo. Elige la carpeta de Questlog.`);

let archivos = new Map();   // ruta relativa (runs/x.json, encounters/y.json.gz) -> File
let indiceEnc = [];

$('carpeta').addEventListener('change', (ev) => cargarCarpeta(new Map([...ev.target.files].map((f) => [f.webkitRelativePath.split('/').slice(1).join('/'), f]))));
// Solo para probar sin el selector de carpetas: el servidor local de prueba sirve la carpeta de Questlog
$('desde-servidor').addEventListener('click', async () => {
  const lista = await fetch('/questlog-lista').then((r) => r.json());
  const m = new Map();
  await Promise.all(lista.map(async (k) => { const b = await fetch('/questlog/' + k).then((r) => r.blob()); m.set(k, new File([b], k.split('/').pop())); }));
  cargarCarpeta(m);
});

async function cargarCarpeta(mapa) {
  const t = performance.now();
  archivos = mapa;
  if (!archivos.has('encounters/index.json') || !archivos.has('runs/index.json')) { log('Esa carpeta no parece la de Questlog (falta encounters/index.json o runs/index.json).'); return; }
  indiceEnc = JSON.parse(await archivos.get('encounters/index.json').text()).entries;
  // Runs: todas (son pequeñas) → tablas runs, run_grupo…
  const runs = [...archivos.keys()].filter((k) => /^runs\/[0-9a-f-]{36}\.json$/.test(k));
  for (const k of runs) await db.registerFileText(k, await archivos.get(k).text());
  await conn.query(`delete from runs; delete from run_grupo; delete from run_miembros; delete from run_build;
    create or replace temp table raw_runs as
      select regexp_extract(filename, '([0-9a-f-]{36})\\.json$', 1) id, json j
      from read_json_objects([${runs.map((k) => `'${k}'`).join(',')}], filename = true, maximum_object_size = 67108864);
    ${cargarRuns}`);
  marca(`${runs.length} runs leídas`, t);
  const enc = new Map(); indiceEnc.forEach((e) => { enc.set(e.log, (enc.get(e.log) || 0) + 1); });
  const lista = await filas(`select r.id, r.log, r.mazmorra, epoch_ms(r.entrada) entrada,
      (select count(*) from run_grupo g where g.run = r.id) jugadores from runs r order by r.entrada desc`);
  const tb = $('runs'); tb.replaceChildren();
  for (const r of lista) {
    const encs = indiceEnc.filter((e) => e.log === r.log && e.durationSeconds > 5);
    // Jefe principal, como extraer-raid.ps1: más intentos de más de 5 s; en empate, el último intentado
    const cnt = {}; encs.forEach((e) => { const c = cnt[e.npc] || (cnt[e.npc] = { n: 0, ultimo: 0 }); c.n++; c.ultimo = Math.max(c.ultimo, e.startedAt); });
    const jefe = Object.entries(cnt).sort((a, b) => b[1].n - a[1].n || b[1].ultimo - a[1].ultimo)[0]?.[0] || '—';
    const tr = document.createElement('tr'); tr.dataset.run = r.id;
    [r.id.slice(0, 8), new Date(Number(r.entrada)).toLocaleString(), r.mazmorra, jefe, enc.get(r.log) || 0, r.jugadores].forEach((v) => { const td = document.createElement('td'); td.textContent = v; tr.append(td); });
    tr.addEventListener('click', () => procesar(r, Number(jefe)));
    tb.append(tr);
  }
  $('runs-sec').hidden = false;
  log(`${lista.length} runs. Pulsa una para procesarla.`);
}

async function gunzip(file) {
  const ds = file.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(ds).text();
}

async function procesar(run, npc) {
  tiempos.length = 0; $('res-sec').hidden = false; $('salida').textContent = '';
  let t = performance.now(); const inicio = t;
  try {
    // 1. Encuentros de la run: descomprimir y registrar (como hace cargar-db.ps1 con read_json_objects)
    const ids = indiceEnc.filter((e) => e.log === run.log).map((e) => e.id);
    const yaCargados = new Set((await filas('select id from encuentros')).map((r) => r.id));
    const nuevos = ids.filter((id) => !yaCargados.has(id) && archivos.has(`encounters/${id}.json.gz`));
    let bytes = 0;
    for (const id of nuevos) { const f = archivos.get(`encounters/${id}.json.gz`); bytes += f.size; await db.registerFileText(`enc/${id}.json`, await gunzip(f)); }
    t = marca(`${nuevos.length} encuentros descomprimidos (${(bytes / 1024).toFixed(0)} KB .gz)`, t);
    if (nuevos.length) {
      await conn.query(`set preserve_insertion_order = false;
        create or replace temp table raw as
          select json ->> 'id' id, json ->> 'log' log, json -> 'fight' fight, json -> 'overview' overview
          from read_json_objects([${nuevos.map((id) => `'enc/${id}.json'`).join(',')}], maximum_object_size = 134217728);
        ${cargar}`);
    }
    t = marca('cargar.sql', t);
    // 2. La raid: misma lógica que extraer-raid.ps1 (slug con fecha local y nombre del jefe)
    const ent = new Date(Number(run.entrada));
    const pad = (n) => String(n).padStart(2, '0');
    const off = -ent.getTimezoneOffset(), sgn = off >= 0 ? '+' : '-';
    const fecha = `${ent.getFullYear()}-${pad(ent.getMonth() + 1)}-${pad(ent.getDate())}T${pad(ent.getHours())}:${pad(ent.getMinutes())}:${pad(ent.getSeconds())}${sgn}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
    const jefe = JSON.parse(nombresEs).npcs?.[npc] || `Jefe ${npc}`;
    const slugJefe = jefe.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = `${fecha.slice(0, 10)}-${pad(ent.getHours())}${pad(ent.getMinutes())}-${slugJefe}`;
    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    await conn.query(`${vistas}
      delete from raids where slug = ${q(slug)};
      insert into raids values (${q(slug)}, ${q(run.id)}, ${npc}, ${q(fecha)}::timestamptz, true);
      set variable slug = ${q(slug)}; set variable jefe = ${q(jefe)}; set variable fecha = ${q(fecha)}; set variable extraido = 'navegador';`);
    const res = await filas(raidSql);
    t = marca('raid.sql', t);
    const json = res[0].raid_json;
    marca('TOTAL de la run', inicio);
    const mem = (await filas('select sum(memory_usage_bytes)::bigint b from duckdb_memory()'))[0].b;
    const enc = (await filas('select count(*)::int n, (select count(*)::int from golpes) g from encuentros'))[0];
    tiempos.push(`Memoria de DuckDB: ${(Number(mem) / 1048576).toFixed(1)} MB con ${enc.n} encuentros (${enc.g} golpes) cargados`);
    $('tiempos').textContent = tiempos.join('\n');
    const datos = JSON.parse(json);
    $('salida').textContent = `slug=${slug}  jefe=${jefe}  fecha=${fecha}\nintentos=${datos.resumen.intentos}  jugadores=${datos.jugadores.length}  bytes=${json.length}\n\n` + json.slice(0, 1500) + '…';
    // 3. Guardar el JSON en el servidor local de prueba para compararlo con DuckDB nativo
    const r = await fetch(`/guardar?nombre=${encodeURIComponent(run.id.slice(0, 8))}-navegador.json`, { method: 'POST', body: json });
    log(r.ok ? `Procesada ${slug}. JSON guardado para comparar.` : 'Procesada, pero no se pudo guardar el JSON.');
    const meta = { slug, jefe, fecha, run: run.id, npc, version, tiempos: [...tiempos] };
    await fetch(`/guardar?nombre=${encodeURIComponent(run.id.slice(0, 8))}-meta.json`, { method: 'POST', body: JSON.stringify(meta) });
  } catch (e) {
    $('salida').innerHTML = ''; $('salida').append(Object.assign(document.createElement('span'), { className: 'bad', textContent: String(e.stack || e) }));
    log('Error al procesar.');
  }
}
