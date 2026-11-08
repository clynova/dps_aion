// Migración de la web estática a la base: raids/*/data.json (+ analisis*.json), jugadores/*/perfil*.json y
// nombres*.json (nombres, iconos y apodos). Idempotente: se puede repetir (por ejemplo, justo antes del corte).
//   npm run migrar -- --grupo <slug-del-grupo> [--visibilidad publica|enlace|privada]
// El grupo tiene que existir (créalo en /mis-grupos). Las raids de la web actual son públicas: por defecto, 'publica'.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import * as t from '@/lib/db/schema';
import { validarRaid } from '@/lib/ingest/esquema';
import { guardarRaid } from '@/lib/ingest/guardar';
import { esVisibilidad } from '@/lib/permisos';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const slugGrupo = arg('grupo');
const visibilidad = arg('visibilidad') ?? 'publica';
if (!slugGrupo || !esVisibilidad(visibilidad)) { console.error('Uso: npm run migrar -- --grupo <slug> [--visibilidad publica|enlace|privada]'); process.exit(2); }
const leer = (p: string) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));

const [grupo] = await db.select().from(t.grupos).where(eq(t.grupos.slug, slugGrupo)).limit(1);
if (!grupo) { console.error(`No existe el grupo «${slugGrupo}». Créalo antes en /mis-grupos.`); process.exit(2); }
console.log(`Migrando al grupo «${grupo.nombre}» (/g/${grupo.slug}), visibilidad ${visibilidad}`);

// 1. Raids y sus análisis
let nRaids = 0, nAnalisis = 0;
for (const dir of readdirSync('raids').sort()) {
  const ruta = `raids/${dir}/data.json`;
  if (!existsSync(ruta)) continue;
  const v = validarRaid(leer(ruta));
  if (!v.ok) { console.error(`✗ ${dir}:\n  ${v.problemas.join('\n  ')}`); process.exitCode = 1; continue; }
  const g = await guardarRaid({ grupoId: grupo.id, datos: v.datos, origen: 'migracion', visibilidad });
  nRaids++;
  for (const [archivo, idioma] of [['analisis.json', 'es'], ['analisis.en.json', 'en']] as const) {
    const p = `raids/${dir}/${archivo}`;
    if (!existsSync(p)) continue;
    const contenido = leer(p);
    await db.insert(t.analisis).values({ raidId: g.raidId, idioma, contenido, autor: 'claude' })
      .onConflictDoUpdate({ target: [t.analisis.raidId, t.analisis.idioma], set: { contenido, actualizado: new Date() } });
    nAnalisis++;
  }
  console.log(`✓ ${dir} · ${g.nueva ? 'nueva' : 'actualizada'} · ${g.jugadores} jugadores · ${g.filas} filas`);
}

// 2. Perfiles escritos por Claude (por grupo: se reemplazan los de este grupo)
let nPerfiles = 0;
for (const slug of readdirSync('jugadores').sort()) {
  const [j] = await db.select({ id: t.jugadores.id }).from(t.jugadores).where(eq(t.jugadores.slug, slug)).limit(1);
  if (!j) continue;
  for (const [archivo, idioma] of [['perfil.json', 'es'], ['perfil.en.json', 'en']] as const) {
    const p = `jugadores/${slug}/${archivo}`;
    if (!existsSync(p)) continue;
    const contenido = leer(p);
    await db.delete(t.perfilTexto).where(and(eq(t.perfilTexto.jugadorId, j.id), eq(t.perfilTexto.grupoId, grupo.id), eq(t.perfilTexto.idioma, idioma)));
    await db.insert(t.perfilTexto).values({ jugadorId: j.id, grupoId: grupo.id, idioma, contenido, raids: typeof contenido.raids === 'number' ? contenido.raids : null });
    nPerfiles++;
  }
}

// 3. Nombres de questlog.gg (habilidades, npcs, iconos) y apodos a mano (globales)
let nNombres = 0, nApodos = 0;
for (const [archivo, idioma] of [['nombres.json', 'es'], ['nombres.en.json', 'en']] as const) {
  if (!existsSync(archivo)) continue;
  const n = leer(archivo) as { habilidades?: Record<string, string>; npcs?: Record<string, string>; iconos?: Record<string, string>; apodos?: Record<string, string> };
  const filas: (typeof t.nombres.$inferInsert)[] = [];
  for (const [id, nombre] of Object.entries(n.habilidades ?? {})) if (nombre) filas.push({ tipo: 'habilidad', id: Number(id), idioma, nombre, icono: n.iconos?.[id] ?? null });
  for (const [id, nombre] of Object.entries(n.npcs ?? {})) if (nombre) filas.push({ tipo: 'npc', id: Number(id), idioma, nombre, icono: null });
  for (let i = 0; i < filas.length; i += 500) {
    await db.insert(t.nombres).values(filas.slice(i, i + 500)).onConflictDoUpdate({
      target: [t.nombres.tipo, t.nombres.id, t.nombres.idioma], set: { nombre: sql`excluded.nombre`, icono: sql`excluded.icono` },
    });
  }
  nNombres += filas.length;
  await db.delete(t.apodos).where(and(eq(t.apodos.idioma, idioma), isNull(t.apodos.grupoId)));
  const apodos = Object.entries(n.apodos ?? {}).filter(([, a]) => a).map(([id, apodo]) => ({ tipo: 'habilidad' as const, refId: Number(id), idioma, apodo, grupoId: null }));
  if (apodos.length) await db.insert(t.apodos).values(apodos);
  nApodos += apodos.length;
}

console.log(`\nListo: ${nRaids} raids, ${nAnalisis} análisis, ${nPerfiles} perfiles de Claude, ${nNombres} nombres, ${nApodos} apodos.`);
process.exit(process.exitCode ?? 0);
