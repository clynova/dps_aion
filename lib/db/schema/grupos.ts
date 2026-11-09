// Grupos, miembros, invitaciones y tokens de publicación (plan, apartados 3.2 y 3.3).
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';

export const rolEnum = pgEnum('rol', ['propietario', 'admin', 'publicador', 'miembro']);
export const visibilidadEnum = pgEnum('visibilidad', ['privada', 'enlace', 'publica']);

export const grupos = pgTable('grupos', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  /** Si sale en la portada y en el buscador. Un grupo nuevo es oculto. */
  visible: boolean('visible').notNull().default(false),
  visibilidadDefecto: visibilidadEnum('visibilidad_defecto').notNull().default('privada'),
  guardarBrutos: boolean('guardar_brutos').notNull().default(false),
  /** Webhook de Discord para «solicitar análisis», cifrado (lib/cifrado.ts). */
  discordWebhookCifrado: text('discord_webhook_cifrado'),
  /** Resumen en Discord al subir una raid nueva: null = no; 'es' / 'en' = sí, en ese idioma (necesita el webhook). */
  avisoRaids: text('aviso_raids'),
  creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  creadoPor: text('creado_por').references(() => user.id, { onDelete: 'set null' }),
});

export const miembros = pgTable('miembros', {
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  usuarioId: text('usuario_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  rol: rolEnum('rol').notNull(),
  desde: timestamp('desde', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.grupoId, t.usuarioId] }), index('miembros_usuario_idx').on(t.usuarioId)]);

export const invitaciones = pgTable('invitaciones', {
  /** Código aleatorio de la URL /unirse/<codigo> */
  codigo: text('codigo').primaryKey(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  /** Nunca 'propietario': la propiedad solo se transfiere. */
  rol: rolEnum('rol').notNull().default('miembro'),
  caduca: timestamp('caduca', { withTimezone: true }),
  usosMax: integer('usos_max'),
  usos: integer('usos').notNull().default(0),
  revocada: boolean('revocada').notNull().default(false),
  creadaPor: text('creada_por').references(() => user.id, { onDelete: 'set null' }),
  creada: timestamp('creada', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('invitaciones_grupo_idx').on(t.grupoId), check('invitaciones_rol_no_propietario', sql`${t.rol} <> 'propietario'`)]);

export const tokensApi = pgTable('tokens_api', {
  id: uuid('id').primaryKey().defaultRandom(),
  grupoId: uuid('grupo_id').notNull().references(() => grupos.id, { onDelete: 'cascade' }),
  nombre: text('nombre').notNull(),
  /** SHA-256 del token: el token en claro solo se muestra una vez al crearlo. */
  hash: text('hash').notNull().unique(),
  ultimoUso: timestamp('ultimo_uso', { withTimezone: true }),
  creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
  creadoPor: text('creado_por').references(() => user.id, { onDelete: 'set null' }),
  revocado: boolean('revocado').notNull().default(false),
}, (t) => [index('tokens_grupo_idx').on(t.grupoId)]);
