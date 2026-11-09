// Procesa la carpeta de Questlog EN EL NAVEGADOR con DuckDB-WASM y el mismo SQL que el PC (lib/procesado/sql.generado.ts):
// lista las runs (db/runs.sql) y, para la elegida, descomprime sus encuentros y ejecuta cargar.sql + vistas.sql + raid.sql.
// Resultado: el JSON de la raid, igual que el de tools/extraer-raid.ps1 (comprobado en la fase 1 y en tests/e2e).
// Solo se importa desde la página de subida (DuckDB-WASM pesa ~7 MB): no entra en las páginas de lectura.
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { SQL, SQL_VERSION } from './sql.generado';

export type RunListada = {
  id: string; log: string; mazmorra: number | null; entrada: number; encuentros: number;
  jefe: number | null; intentosJefe: number; jugadores: number;
};
export type Procesada = { slug: string; json: Record<string, unknown>; segundos: number };

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const dos = (n: number) => String(n).padStart(2, '0');
/** Fecha local con su zona, como extraer-raid.ps1 (yyyy-MM-ddTHH:mm:sszzz) */
export function fechaLocal(ms: number): string {
  const d = new Date(ms), off = -d.getTimezoneOffset(), sgn = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}${sgn}${dos(Math.floor(Math.abs(off) / 60))}:${dos(Math.abs(off) % 60)}`;
}
/** Slug como extraer-raid.ps1: fecha y hora local + nombre del jefe sin tildes */
export function slugRaid(ms: number, jefe: string): string {
  const f = fechaLocal(ms);
  const nombre = jefe.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${f.slice(0, 10)}-${f.slice(11, 13)}${f.slice(14, 16)}-${nombre}`;
}

/**
 * Archivos elegidos con <input webkitdirectory> → mapa «runs/x.json» / «encounters/y.json.gz» → File.
 * Sirve tanto si eligen la carpeta aion-2 como Questlog o una superior: se busca el tramo runs/ o encounters/.
 */
export function mapaQuestlog(files: Iterable<File & { webkitRelativePath?: string }>): Map<string, File> {
  const m = new Map<string, File>();
  for (const f of files) {
    const partes = (f.webkitRelativePath || f.name).split('/');
    const i = partes.findIndex((p, j) => (p === 'runs' || p === 'encounters') && j === partes.length - 2);
    if (i >= 0) m.set(`${partes[i]}/${partes[i + 1]}`, f);
  }
  return m;
}

export class Procesador {
  private cola: Promise<unknown> = Promise.resolve();
  private archivos = new Map<string, File>();
  private indice: { id: string; log: string }[] = [];
  private cargados = new Set<string>();
  private constructor(private db: AsyncDuckDB, private conn: AsyncDuckDBConnection, readonly version: string) {}

  static async crear(): Promise<Procesador> {
    const duckdb = await import('@duckdb/duckdb-wasm');
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(workerUrl));
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    const conn = await db.connect();
    await conn.query(SQL.esquema);
    const v = (await conn.query('select version() v')).toArray()[0].toJSON().v as string;
    return new Procesador(db, conn, v);
  }

  /** Todo pasa por esta cola: nunca dos procesados a la vez (comparten conexión y variables de DuckDB). */
  private enCola<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.cola.then(fn, fn);
    this.cola = r.catch(() => undefined);
    return r;
  }
  private async filas<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    return (await this.conn.query(sql)).toArray().map((r) => r.toJSON() as T);
  }

  /** Lee la carpeta: runs (todas, son pequeñas) e índice de encuentros. Devuelve la lista de runs. */
  cargarCarpeta(archivos: Map<string, File>): Promise<RunListada[]> {
    return this.enCola(async () => {
      if (!archivos.has('encounters/index.json') || !archivos.has('runs/index.json')) throw new Error('carpeta');
      this.archivos = archivos;
      const ind = JSON.parse(await archivos.get('encounters/index.json')!.text()) as { entries: { id: string; log: string; npc: number; durationSeconds: number; startedAt: number }[] };
      this.indice = ind.entries.map((e) => ({ id: e.id, log: e.log }));
      const runs = [...archivos.keys()].filter((k) => /^runs\/[0-9a-f-]{36}\.json$/.test(k));
      for (const k of runs) await this.db.registerFileText(k, await archivos.get(k)!.text());
      await this.conn.query(`delete from runs; delete from run_grupo; delete from run_miembros; delete from run_build;
        create or replace temp table raw_runs as
          select regexp_extract(filename, '([0-9a-f-]{36})\\.json$', 1) id, json j
          from read_json_objects([${runs.map(q).join(',') || "''"}], filename = true, maximum_object_size = 67108864);
        ${SQL.cargarRuns}
        create or replace temp table indice (id varchar, log varchar, npc integer, duracion_s double, inicio_ms bigint);`);
      const valores = ind.entries.map((e) => `(${q(e.id)}, ${q(e.log)}, ${Number(e.npc) || 'null'}, ${Number(e.durationSeconds) || 0}, ${Number(e.startedAt) || 0})`);
      for (let i = 0; i < valores.length; i += 500) await this.conn.query(`insert into indice values ${valores.slice(i, i + 500).join(',')}`);
      const lista = await this.filas<Record<string, unknown>>(SQL.runs);
      return lista.map((r) => ({
        id: String(r.id), log: String(r.log), mazmorra: r.mazmorra === null ? null : Number(r.mazmorra), entrada: Number(r.entrada),
        encuentros: Number(r.encuentros), jefe: r.jefe === null ? null : Number(r.jefe), intentosJefe: Number(r.intentos_jefe), jugadores: Number(r.jugadores),
      }));
    });
  }

  /**
   * Calcula la raid de una run (como extraer-raid.ps1): descomprime sus encuentros, los carga y ejecuta raid.sql.
   * `npcsEs`: nombres en español de los npcs (para meta.jefe y «otros», igual que nombres.json en el PC).
   */
  procesarRun(run: RunListada, npcsEs: Record<string, string>, alAvanzar?: (paso: string) => void): Promise<Procesada> {
    return this.enCola(async () => {
      if (!run.jefe) throw new Error('sin-intentos');
      const t0 = performance.now();
      const ids = this.indice.filter((e) => e.log === run.log && !this.cargados.has(e.id)).map((e) => e.id);
      const nuevos: string[] = [];
      for (const id of ids) {
        const f = this.archivos.get(`encounters/${id}.json.gz`);
        if (!f) continue;
        alAvanzar?.(`descomprimir:${nuevos.length + 1}/${ids.length}`);
        const texto = await new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text();
        await this.db.registerFileText(`enc/${id}.json`, texto);
        nuevos.push(id);
      }
      if (nuevos.length) {
        alAvanzar?.('cargar');
        await this.conn.query(`set preserve_insertion_order = false;
          create or replace temp table raw as
            select json ->> 'id' id, json ->> 'log' log, json -> 'fight' fight, json -> 'overview' overview
            from read_json_objects([${nuevos.map((id) => q(`enc/${id}.json`)).join(',')}], maximum_object_size = 134217728);
          ${SQL.cargar}`);
        nuevos.forEach((id) => this.cargados.add(id));
      }
      alAvanzar?.('calcular');
      const jefe = npcsEs[String(run.jefe)] || `Jefe ${run.jefe}`;
      const slug = slugRaid(run.entrada, jefe), fecha = fechaLocal(run.entrada);
      const nombres = Object.entries(npcsEs).map(([id, n]) => `('npc', ${Number(id)}, ${q(n)}, null, null, null, null)`);
      await this.conn.query(`delete from nombres; ${nombres.length ? `insert into nombres values ${nombres.join(',')};` : ''}
        ${SQL.vistas}
        delete from raids where slug = ${q(slug)};
        insert into raids values (${q(slug)}, ${q(run.id)}, ${run.jefe}, ${q(fecha)}::timestamptz, true);
        set variable slug = ${q(slug)}; set variable jefe = ${q(jefe)}; set variable fecha = ${q(fecha)};
        set variable extraido = ${q(fechaLocal(Date.now()))};`);
      const [fila] = await this.filas<{ raid_json: string }>(SQL.raid);
      const datos = JSON.parse(fila.raid_json);
      return { slug, json: { esquema_version: 2, sql_version: SQL_VERSION, ...datos }, segundos: (performance.now() - t0) / 1000 };
    });
  }
}
