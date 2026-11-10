// Formato del contenido del módulo «Raids» (docs/plan-guia-raids.md): la estructura del juego, el catálogo de fuentes y
// las fichas de cada raid y de cada jefe, en contenido/. Los objetos son estrictos: una clave mal escrita es un error.
// Cada afirmación dice de dónde sale (`origen`) y, si viene de fuera, con qué fuentes del catálogo.
import { z } from 'zod';

const ent = z.number().int();
const id = ent.positive();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug en minúsculas con guiones');
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha AAAA-MM-DD');
const texto = z.string().trim().min(1).max(2000);
const corto = z.string().trim().min(1).max(160);
const pct = z.number().min(0).max(100);

// ── Estructura del juego (scripts/estructura-juego.mjs) ──────────────────────────────────────────────

export const Estructura = z.strictObject({
  fuente: slug,
  game_data: fecha,
  generado: fecha,
  mazmorras: z.array(z.strictObject({ id, jefes: z.array(id) })),
  jefes: z.record(z.string().regex(/^\d+$/), z.strictObject({
    es: corto, en: corto, retrato: z.string().nullable(), mazmorras: z.array(id).min(1),
  })),
  stats: z.record(z.string().min(1), z.strictObject({
    stat: ent, categoria: z.string().nullable(), nombre: z.string(), descripcion: z.string(),
  })),
});
export type Estructura = z.infer<typeof Estructura>;

// ── Catálogo de fuentes (contenido/raids/fuentes.json) ───────────────────────────────────────────────

/** juego = datos del cliente; oficial = NCSOFT; guia = guía de la comunidad; foro = hilo o vídeo; base-de-datos = web que lee el cliente. */
export const TIPOS_FUENTE = ['juego', 'oficial', 'guia', 'foro', 'base-de-datos'] as const;
export const TEMAS = ['estructura', 'mecanicas', 'composicion', 'equipo', 'stats', 'botin', 'reglas', 'nombres'] as const;

export const Fuente = z.strictObject({
  id: slug,
  titulo: corto,
  sitio: corto,
  url: z.url({ protocol: /^https$/ }).nullable(),
  tipo: z.enum(TIPOS_FUENTE),
  idioma: z.enum(['es', 'en', 'ko', 'de', 'tr', 'zh']),
  consultado: fecha,
  temas: z.array(z.enum(TEMAS)).min(1),
  nota: z.strictObject({ es: texto, en: texto }).optional(),
});
export type Fuente = z.infer<typeof Fuente>;

export const Catalogo = z.strictObject({ fuentes: z.array(Fuente).min(1) });
export type Catalogo = z.infer<typeof Catalogo>;

// ── Fichas ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * juego / oficial: al menos una fuente de ese tipo. guias: al menos dos fuentes (las guías se contradicen).
 * datos: sale de nuestras raids (la página pone la cifra). deduccion: nuestra, a partir de datos o guías.
 */
export const ORIGENES = ['juego', 'oficial', 'guias', 'datos', 'deduccion'] as const;
export type Origen = (typeof ORIGENES)[number];

const conOrigen = { origen: z.enum(ORIGENES), fuentes: z.array(slug).default([]) };

export const Afirmacion = z.strictObject({ texto, ...conOrigen });
export const Rango = z.strictObject({ min: z.number().nonnegative(), max: z.number().nonnegative(), ...conOrigen })
  .refine((r) => r.min <= r.max, 'min mayor que max');

export const ROLES = ['todos', 'tanque', 'sanador', 'dps', 'apoyo'] as const;
/** Si la mecánica se ve en nuestros registros de la versión actual: visto (sí), probable (deducido de los datos) o sin_ver. */
export const EN_DATOS = ['visto', 'probable', 'sin_ver'] as const;
export const MODOS = ['normal', 'dificil'] as const;

const nota = z.strictObject({ termino: corto, texto });

export const FichaRaid = z.strictObject({
  id: slug,
  nombre: corto,
  revisado: fecha,
  parche: fecha,
  resumen: texto,
  /** Cada modo con su mazmorra (id de game-data). */
  mazmorras: z.array(z.strictObject({ id, modo: z.enum(MODOS), ...conOrigen })).min(1),
  jugadores: ent.min(1).max(40),
  /** Jefes en el orden en que se hacen (npc de la mazmorra del primer modo). */
  jefes: z.array(id).min(1),
  gs: z.partialRecord(z.enum(MODOS), z.strictObject({ valor: ent.positive(), ...conOrigen })).default({}),
  reglas: z.array(Afirmacion).default([]),
  composicion: z.array(Afirmacion).default([]),
  notas: z.array(nota).default([]),
});
export type FichaRaid = z.infer<typeof FichaRaid>;

export const Mecanica = z.strictObject({
  id: slug,
  titulo: corto,
  texto,
  /** Qué hacer, en una línea. */
  como: texto,
  /** Ids de los ataques del jefe (casteos / apodos) que forman la mecánica. */
  ataques: z.array(id).default([]),
  wipe: z.boolean().default(false),
  roles: z.array(z.enum(ROLES)).min(1),
  modos: z.array(z.enum(MODOS)).default([]),
  en_datos: z.enum(EN_DATOS).default('sin_ver'),
  infografia: slug.optional(),
  ...conOrigen,
});

export const FichaJefe = z.strictObject({
  /** El primero es el de la mazmorra principal; el resto, el mismo jefe en otros modos. */
  npc: z.array(id).min(1),
  raid: slug,
  revisado: fecha,
  parche: fecha,
  resumen: texto,
  fases: z.array(z.strictObject({
    titulo: corto, desde_vida: pct, hasta_vida: pct, texto, ...conOrigen,
  }).refine((f) => f.desde_vida >= f.hasta_vida, 'desde_vida menor que hasta_vida')).default([]),
  mecanicas: z.array(Mecanica).default([]),
  consejos: z.partialRecord(z.enum(ROLES), z.array(Afirmacion).min(1)).default({}),
  requisitos: z.strictObject({
    precision: Rango.optional(),
    critico: Rango.optional(),
  }).default({}),
  notas: z.array(nota).default([]),
});
export type FichaJefe = z.infer<typeof FichaJefe>;

/** Claves cuyo valor es texto traducible: lo único que puede cambiar entre el .es.json y el .en.json. */
export const CLAVES_TEXTO = new Set(['nombre', 'resumen', 'texto', 'titulo', 'como', 'termino']);
