// Prueba de paridad (plan, fases 4, 5 y 9): lo que hay en la base tiene que reproducir EXACTAMENTE la web actual.
//   npm run paridad -- --grupo <slug>
// Compara cada raids/<slug>/data.json con la raid reconstruida desde la base, los análisis es/en y los perfiles
// escritos por Claude; y cada jugadores/<slug>/data.json con el perfil calculado (lib/perfil/construir.ts).
// Sale con código 1 si hay cualquier diferencia.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import * as t from '@/lib/db/schema';
import { compararJson } from '@/lib/comparar';
import { reconstruirRaid } from '@/lib/raids/reconstruir';
import { construirPerfiles } from '@/lib/perfil/construir';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const slugGrupo = arg('grupo');
if (!slugGrupo) { console.error('Uso: npm run paridad -- --grupo <slug>'); process.exit(2); }
const leer = (p: string) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const [grupo] = await db.select().from(t.grupos).where(eq(t.grupos.slug, slugGrupo)).limit(1);
if (!grupo) { console.error(`No existe el grupo «${slugGrupo}»`); process.exit(2); }

let total = 0;
const informe = (que: string, dif: string[]) => {
  total += dif.length;
  console.log(`${dif.length ? '✗' : '✓'} ${que}${dif.length ? ` · ${dif.length} diferencias` : ''}`);
  for (const d of dif.slice(0, 15)) console.log(`    ${d}`);
};

// Raids y análisis
for (const dir of readdirSync('raids').sort()) {
  if (!existsSync(`raids/${dir}/data.json`)) continue;
  const original = leer(`raids/${dir}/data.json`);
  const [r] = await db.select({ id: t.raids.id }).from(t.raids).where(and(eq(t.raids.grupoId, grupo.id), eq(t.raids.slug, original.meta.slug))).limit(1);
  if (!r) { informe(`raid ${dir}`, ['no está en la base']); continue; }
  informe(`raid ${dir}`, compararJson(original, await reconstruirRaid(r.id), { sinOrden: ['causas'] }));
  for (const [archivo, idioma] of [['analisis.json', 'es'], ['analisis.en.json', 'en']] as const) {
    if (!existsSync(`raids/${dir}/${archivo}`)) continue;
    const [a] = await db.select({ c: t.analisis.contenido }).from(t.analisis).where(and(eq(t.analisis.raidId, r.id), eq(t.analisis.idioma, idioma))).limit(1);
    informe(`  análisis ${idioma}`, a ? compararJson(leer(`raids/${dir}/${archivo}`), a.c) : ['no está en la base']);
  }
}

// Perfiles escritos por Claude
for (const slug of readdirSync('jugadores').sort()) {
  for (const [archivo, idioma] of [['perfil.json', 'es'], ['perfil.en.json', 'en']] as const) {
    if (!existsSync(`jugadores/${slug}/${archivo}`)) continue;
    const [p] = await db.select({ c: t.perfilTexto.contenido }).from(t.perfilTexto).innerJoin(t.jugadores, eq(t.jugadores.id, t.perfilTexto.jugadorId))
      .where(and(eq(t.jugadores.slug, slug), eq(t.perfilTexto.grupoId, grupo.id), eq(t.perfilTexto.idioma, idioma))).limit(1);
    informe(`perfil de Claude ${slug} ${idioma}`, p ? compararJson(leer(`jugadores/${slug}/${archivo}`), p.c) : ['no está en la base']);
  }
}

// Perfiles calculados (lo que hacía tools/perfiles.ps1) e índice de jugadores
const ids = await db.select({ id: t.raids.id }).from(t.raids).where(eq(t.raids.grupoId, grupo.id));
const raidsDatos = await Promise.all(ids.map((r) => reconstruirRaid(r.id)));
const conPerfil = new Set(readdirSync('jugadores').filter((s) => existsSync(`jugadores/${s}/perfil.json`)));
const { perfiles, indice } = construirPerfiles(raidsDatos, conPerfil);
for (const slug of readdirSync('jugadores').sort()) {
  if (!existsSync(`jugadores/${slug}/data.json`)) continue;
  const original = leer(`jugadores/${slug}/data.json`);
  const calculado = perfiles[original.nombre];
  if (!calculado) { informe(`perfil calculado ${slug}`, ['no sale en el cálculo']); continue; }
  const dif = compararJson(original, calculado, { ignorar: ['actualizado', 'causas'] });
  // Causas (top 8): perfiles.ps1 desempataba al azar (orden de una tabla hash) y la versión nueva lo hace por golpe
  // máximo e id. Se exige lo que no depende del desempate: mismas muertes por puesto y cifras correctas en ambas listas.
  const todas = new Map<string, { n: number; max: number }>();
  for (const r of raidsDatos) for (const m of (r!.detalle as Record<string, { muertes: { habilidad: string; origen: string; golpe_max: number }[] }>)[original.nombre]?.muertes ?? []) {
    const k = `${m.habilidad}|${m.origen}`; const c = todas.get(k) ?? { n: 0, max: 0 }; c.n++; c.max = Math.max(c.max, m.golpe_max); todas.set(k, c);
  }
  const puestos = (l: { muertes: number }[]) => l.map((c) => c.muertes).join(',');
  if (puestos(original.causas) !== puestos(calculado.causas)) dif.push(`.causas : muertes por puesto ${puestos(original.causas)} <> ${puestos(calculado.causas)}`);
  for (const [lista, cual] of [[original.causas, 'original'], [calculado.causas, 'calculada']] as const) {
    for (const c of lista as { habilidad: string; origen: string; muertes: number; golpe_max: number }[]) {
      const x = todas.get(`${c.habilidad}|${c.origen}`);
      if (!x || x.n !== c.muertes || Math.round(x.max) !== c.golpe_max) dif.push(`.causas (${cual}) ${c.habilidad}|${c.origen} : cifras que no salen de las muertes`);
    }
  }
  informe(`perfil calculado ${slug}`, dif);
}
informe('índice de jugadores', compararJson(leer('jugadores/index.json'), indice));

console.log(total ? `\n${total} diferencias en total.` : '\nParidad completa: 0 diferencias.');
process.exit(total ? 1 : 0);
