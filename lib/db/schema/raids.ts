// Jugadores y datos de raid: lo que hoy es raids/<slug>/data.json, normalizado (plan, apartado 3.3).
// Las medias de grupo y de clase y las causas de muerte NO se guardan: son vistas y consultas.
// Decimales en double precision (los JSON traen 1 decimal y deben volver idénticos en la prueba de paridad).
import { bigint, boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { RepasoMuerte, VentanasRaid } from '../../ingest/esquema';
import { user } from './auth';
import { grupos, visibilidadEnum } from './grupos';

const n = (nombre: string) => bigint(nombre, { mode: 'number' });

export const jugadores = pgTable('jugadores', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  /** Servidor de Aion 2; las 5 raids anteriores a la v2 no lo traen (null). */
  servidor: integer('servidor'),
  slug: text('slug').notNull().unique(),
  claseId: text('clase_id'),
  /** «Ocultar mi nombre» en raids de grupos a los que no pertenece. */
  oculto: boolean('oculto').notNull().default(false),
  usuarioId: text('usuario_id').references(() => user.id, { onDelete: 'set null' }),
  creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('jugadores_nombre_servidor').on(t.nombre, t.servidor).nullsNotDistinct()]);

export const origenEnum = pgEnum('origen_raid', ['navegador', 'pc', 'migracion']);

export const raids = pgTable('raids', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  runId: text('run_id'),
  /** Jefe, día, jugadores y duraciones: detecta la misma noche subida dos veces (lib/ingest/huella.ts). */
  huella: text('huella'),
  fecha: timestamp('fecha', { withTimezone: true }).notNull(),
  mazmorra: integer('mazmorra'),
  npcJefe: integer('npc_jefe').notNull(),
  jefe: text('jefe'),
  visibilidad: visibilidadEnum('visibilidad').notNull().default('privada'),
  intentos: integer('intentos').notNull(),
  matado: boolean('matado').notNull(),
  killS: integer('kill_s'),
  minutosCombate: doublePrecision('minutos_combate'),
  mejorPct: doublePrecision('mejor_pct'),
  mejorIntento: integer('mejor_intento'),
  muertesGrupo: integer('muertes_grupo'),
  dpsGrupoMedio: integer('dps_grupo_medio'),
  hpJefe: n('hp_jefe'),
  runMin: doublePrecision('run_min'),
  limiteMin: integer('limite_min'),
  reseteos: integer('reseteos'),
  grabadoPor: text('grabado_por'),
  /** El objeto meta del data.json tal cual: conserva la fecha con su zona (-03:00) y campos como run_min o reseteos. */
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull(),
  /** Ventanas de daño (ventanas del data.json, tal cual; raids extraídas desde el 9/11/2026). */
  ventanas: jsonb('ventanas').$type<VentanasRaid>(),
  subidoPor: text('subido_por').references(() => user.id, { onDelete: 'set null' }),
  origen: origenEnum('origen').notNull(),
  esquemaVersion: integer('esquema_version').notNull(),
  sqlVersion: text('sql_version'),
  extraido: timestamp('extraido', { withTimezone: true }),
  publicado: timestamp('publicado', { withTimezone: true }).notNull().defaultNow(),
  /** Último análisis automático pedido a la IA (DeepSeek): no se repite antes de 24 h. Se reserva antes de llamar a la IA. */
  analisisIa: timestamp('analisis_ia', { withTimezone: true }),
}, (t) => [
  unique('raids_grupo_slug').on(t.grupoId, t.slug),
  index('raids_grupo_fecha_idx').on(t.grupoId, t.fecha.desc()),
  index('raids_huella_idx').on(t.huella),
]);

const raidRef = () => uuid('raid_id').notNull().references(() => raids.id, { onDelete: 'cascade' });
const jugadorRef = (col = 'jugador_id') => integer(col).notNull().references(() => jugadores.id, { onDelete: 'cascade' });

export const raidOtros = pgTable('raid_otros', {
  raidId: raidRef(), orden: integer('orden').notNull(), npc: integer('npc').notNull(), jefe: text('jefe'), intentos: integer('intentos'),
  matado: boolean('matado').notNull(), killS: integer('kill_s'), dpsRaid: integer('dps_raid'),
}, (t) => [primaryKey({ columns: [t.raidId, t.npc] })]);

export const intentos = pgTable('intentos', {
  raidId: raidRef(), n: integer('n').notNull(), duracionS: integer('duracion_s').notNull(),
  progresoPct: doublePrecision('progreso_pct').notNull(), matado: boolean('matado').notNull(),
  dpsGrupo: integer('dps_grupo'), muertes: integer('muertes'), roturaS: integer('rotura_s'), ultimaCausa: text('ultima_causa'),
}, (t) => [primaryKey({ columns: [t.raidId, t.n] })]);

export const curva = pgTable('curva', {
  raidId: raidRef(), intento: integer('intento').notNull(), orden: integer('orden').notNull(),
  t: doublePrecision('t').notNull(), progreso: doublePrecision('progreso').notNull(),
}, (t) => [primaryKey({ columns: [t.raidId, t.intento, t.orden] })]);

export const casteosJefe = pgTable('casteos_jefe', {
  raidId: raidRef(), intento: integer('intento').notNull(), orden: integer('orden').notNull(),
  t: doublePrecision('t').notNull(), habilidad: text('habilidad').notNull(),
}, (t) => [primaryKey({ columns: [t.raidId, t.intento, t.orden] })]);

export const raidJugador = pgTable('raid_jugador', {
  raidId: raidRef(), jugadorId: jugadorRef(),
  /** Posición en la lista jugadores del data.json (por DPS; conserva los desempates tal cual vinieron). */
  orden: integer('orden').notNull(),
  /** Servidor tal como vino en el JSON de ESTA raid (las de la web estática no lo traen: null). */
  servidor: integer('servidor'),
  enGrupo: boolean('en_grupo').notNull().default(true),
  claseId: text('clase_id'), gs: integer('gs'), cp: integer('cp'),
  dps: integer('dps'), hps: integer('hps'), danoRecibido: n('dano_recibido'), muertes: integer('muertes'),
  critPct: doublePrecision('crit_pct'), espaldaPct: doublePrecision('espalda_pct'),
  // apoyo
  curacion: n('curacion'), escudos: n('escudos'), absorbido: n('absorbido'),
  // supervivencia
  golpesRecibidos: integer('golpes_recibidos'), curaRecibida: n('cura_recibida'), escudoRecibido: n('escudo_recibido'),
  resurrecciones: integer('resurrecciones'), bajo30Pct: doublePrecision('bajo30_pct'),
  // rotación
  casteos: integer('casteos'), interrumpidos: integer('interrumpidos'), vivoS: integer('vivo_s'),
  casteosMin: doublePrecision('casteos_min'), pausasPct: doublePrecision('pausas_pct'), primerGolpeS: doublePrecision('primer_golpe_s'),
}, (t) => [primaryKey({ columns: [t.raidId, t.jugadorId] }), index('raid_jugador_jugador_idx').on(t.jugadorId)]);

export const dpsIntento = pgTable('dps_intento', {
  raidId: raidRef(), jugadorId: jugadorRef(), intento: integer('intento').notNull(),
  dps: integer('dps').notNull(), muertes: integer('muertes').notNull(),
}, (t) => [primaryKey({ columns: [t.raidId, t.jugadorId, t.intento] })]);

export const muertes = pgTable('muertes', {
  raidId: raidRef(), jugadorId: jugadorRef(), intento: integer('intento').notNull(), orden: integer('orden').notNull(),
  t: integer('t').notNull(), habilidad: text('habilidad'), origen: text('origen'), golpeMax: n('golpe_max'),
  vida5s: integer('vida_5s'), vida1s: integer('vida_1s'), dano5s: n('dano_5s'), cura5s: n('cura_5s'),
  /** Los 10 s anteriores (detalle.<jugador>.muertes[].repaso, tal cual; raids extraídas desde el 9/11/2026). */
  repaso: jsonb('repaso').$type<RepasoMuerte>(),
}, (t) => [primaryKey({ columns: [t.raidId, t.jugadorId, t.intento, t.orden] }), index('muertes_jugador_idx').on(t.jugadorId)]);

export const tipoDesgloseEnum = pgEnum('tipo_desglose', ['dano', 'recibido', 'cura', 'escudo', 'casteo', 'buff']);

/** Desgloses por habilidad (detalle.<jugador>.habilidades, .recibido, apoyo.cura_hab, rotacion.usos_hab…). */
export const desglose = pgTable('desglose', {
  raidId: raidRef(), jugadorId: jugadorRef(), tipo: tipoDesgloseEnum('tipo').notNull(), orden: integer('orden').notNull(),
  habilidad: text('habilidad').notNull(), valor: doublePrecision('valor'), pct: doublePrecision('pct'), golpes: integer('golpes'),
  /** Campos propios de cada tipo: crit_pct, golpe_max, intervalo_s, receptores… */
  extra: jsonb('extra').$type<Record<string, number | string | null>>(),
}, (t) => [primaryKey({ columns: [t.raidId, t.jugadorId, t.tipo, t.orden] })]);

export const repartoCura = pgTable('reparto_cura', {
  raidId: raidRef(), jugadorId: jugadorRef(), objetivoId: jugadorRef('objetivo_id'), orden: integer('orden').notNull(),
  cantidad: n('cantidad').notNull(), pct: doublePrecision('pct'),
}, (t) => [primaryKey({ columns: [t.raidId, t.jugadorId, t.objetivoId] })]);

/**
 * Golpes directos de cada ataque a cada jugador (mecanicas del data.json; raids extraídas desde el 9/11/2026).
 * Una fila por ataque y jugador; las columnas *_hab son del ataque y se repiten en sus filas.
 */
export const mecanicas = pgTable('mecanicas', {
  raidId: raidRef(), jugadorId: jugadorRef(), habilidad: text('habilidad').notNull(),
  /** Posición del ataque en la lista y del jugador dentro del ataque. */
  orden: integer('orden').notNull(), ordenJugador: integer('orden_jugador').notNull(),
  golpesHab: integer('golpes_hab').notNull(), olasHab: integer('olas_hab').notNull(), alcance: doublePrecision('alcance').notNull(),
  golpes: integer('golpes').notNull(), olas: integer('olas').notNull(), expuesto: integer('expuesto').notNull(),
  dano: n('dano').notNull(), golpeMax: n('golpe_max').notNull(),
}, (t) => [primaryKey({ columns: [t.raidId, t.habilidad, t.jugadorId] }), index('mecanicas_jugador_idx').on(t.jugadorId)]);

export const mitigacion = pgTable('mitigacion', {
  raidId: raidRef(), jugadorId: jugadorRef(), tipo: text('tipo').notNull(),
  n: integer('n').notNull(), evitado: boolean('evitado').notNull(),
}, (t) => [primaryKey({ columns: [t.raidId, t.jugadorId, t.tipo, t.evitado] })]);
