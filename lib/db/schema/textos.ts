// Textos de Claude, nombres de habilidades y NPC, archivos brutos, solicitudes y auditoría (plan, apartado 3.3).
import { bigint, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { grupos } from './grupos';
import { jugadores, raids } from './raids';

export const idiomaEnum = pgEnum('idioma', ['es', 'en']);
export const tipoNombreEnum = pgEnum('tipo_nombre', ['habilidad', 'npc']);

/** Lo que hoy es raids/<slug>/analisis.json y analisis.en.json */
export const analisis = pgTable('analisis', {
  raidId: uuid('raid_id').notNull().references(() => raids.id, { onDelete: 'cascade' }),
  idioma: idiomaEnum('idioma').notNull(),
  contenido: jsonb('contenido').notNull(),
  autor: text('autor').notNull().default('claude'),
  actualizado: timestamp('actualizado', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.raidId, t.idioma] })]);

/** Lo que hoy es jugadores/<slug>/perfil.json y perfil.en.json (por grupo: cada grupo escribe el suyo). */
export const perfilTexto = pgTable('perfil_texto', {
  id: serial('id').primaryKey(),
  jugadorId: integer('jugador_id').notNull().references(() => jugadores.id, { onDelete: 'cascade' }),
  grupoId: uuid('grupo_id').references(() => grupos.id, { onDelete: 'cascade' }),
  idioma: idiomaEnum('idioma').notNull(),
  contenido: jsonb('contenido').notNull(),
  raids: integer('raids'),
  actualizado: timestamp('actualizado', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('perfil_texto_jugador_idx').on(t.jugadorId, t.idioma)]);

/** Nombres de questlog.gg (los refresca el cron) */
export const nombres = pgTable('nombres', {
  tipo: tipoNombreEnum('tipo').notNull(),
  id: bigint('id', { mode: 'number' }).notNull(),
  idioma: idiomaEnum('idioma').notNull(),
  nombre: text('nombre').notNull(),
  icono: text('icono'),
}, (t) => [primaryKey({ columns: [t.tipo, t.id, t.idioma] })]);

/** Apodos a mano: ganan a nombres. grupo_id null = para todos los grupos. */
export const apodos = pgTable('apodos', {
  id: serial('id').primaryKey(),
  tipo: tipoNombreEnum('tipo').notNull(),
  refId: bigint('ref_id', { mode: 'number' }).notNull(),
  idioma: idiomaEnum('idioma').notNull(),
  apodo: text('apodo').notNull(),
  grupoId: uuid('grupo_id').references(() => grupos.id, { onDelete: 'cascade' }),
}, (t) => [index('apodos_ref_idx').on(t.tipo, t.refId, t.idioma)]);

/** Copias de los .json.gz de Questlog en Vercel Blob (opcional, por grupo) */
export const archivos = pgTable('archivos', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  raidId: uuid('raid_id').references(() => raids.id, { onDelete: 'set null' }),
  runId: text('run_id'),
  encuentroId: text('encuentro_id').notNull(),
  blobUrl: text('blob_url').notNull(),
  bytes: integer('bytes').notNull(),
  sha256: text('sha256').notNull(),
  subido: timestamp('subido', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('archivos_grupo_idx').on(t.grupoId)]);

/** «Solicitar análisis»: sustituye al Map en memoria de api/solicitar.js (espera de 10 min fiable). */
export const solicitudes = pgTable('solicitudes', {
  id: serial('id').primaryKey(),
  jugadorId: integer('jugador_id').notNull().references(() => jugadores.id, { onDelete: 'cascade' }),
  grupoId: uuid('grupo_id').references(() => grupos.id, { onDelete: 'cascade' }),
  usuarioId: text('usuario_id').references(() => user.id, { onDelete: 'set null' }),
  creada: timestamp('creada', { withTimezone: true }).notNull().defaultNow(),
  avisada: text('avisada'),
}, (t) => [index('solicitudes_jugador_idx').on(t.jugadorId, t.creada)]);

export const auditoria = pgTable('auditoria', {
  id: serial('id').primaryKey(),
  grupoId: uuid('grupo_id').references(() => grupos.id, { onDelete: 'cascade' }),
  usuarioId: text('usuario_id').references(() => user.id, { onDelete: 'set null' }),
  accion: text('accion').notNull(),
  ref: text('ref'),
  detalle: jsonb('detalle'),
  creada: timestamp('creada', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('auditoria_grupo_idx').on(t.grupoId, t.creada)]);
