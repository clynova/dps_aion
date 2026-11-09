// Formato de subida de una raid: el JSON que genera db/raid.sql (lo mismo que raids/<slug>/data.json).
// v1 = lo que hay hoy (sin esquema_version). v2 = v1 + esquema_version, sql_version, servidor por jugador y en_grupo.
// Los objetos son estrictos: una clave desconocida es un error. Así, si raid.sql gana un campo, se nota aquí (y se
// sube la versión) en vez de perderse sin avisar. Las reglas de coherencia entre secciones van en .superRefine.
import { z } from 'zod';

const ent = z.number().int();
const nat = ent.nonnegative();
const num = z.number().finite();
const pos = num.nonnegative();
const pct = num.min(0).max(100.0001);
const hab = z.string().regex(/^\d*$/, 'id de habilidad');            // '' = no registrada
const origen = z.string().regex(/^(jefe|\d+)?$/, 'origen');          // 'jefe', id de npc o ''
const nombre = z.string().min(1).max(64);

const meta = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
  run: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/, 'fecha ISO con zona'),
  mazmorra: ent.nullable(),
  jefe: z.string(),
  npc: ent,
  personaje: z.string().nullable(),
  grupo: z.array(nombre).min(1),
  run_min: pos.nullable(),
  limite_min: nat.nullable(),
  reseteos: nat,
  extraido: z.string(),
}).strict();

const resumen = z.object({
  intentos: ent.positive(), matado: z.boolean(), kill_s: nat.nullable(), minutos_combate: pos,
  mejor_pct: pct, mejor_intento: ent.positive(), muertes_grupo: nat, dps_grupo_medio: nat, hp_jefe: nat,
}).strict();

const otro = z.object({ npc: ent, jefe: z.string(), intentos: nat, matado: z.boolean(), kill_s: nat.nullable(), dps_raid: nat.nullable() }).strict();
const intento = z.object({
  intento: ent.positive(), duracion_s: nat, progreso_pct: pct, matado: z.boolean(), dps_grupo: nat, muertes: nat,
  rotura_s: nat.nullable(), ultima_causa: hab.nullable(),
}).strict();
const puntoCurva = z.object({ intento: ent.positive(), t: pos, progreso: pct }).strict();
const jugador = z.object({
  jugador: nombre, clase: z.string(), clase_id: z.string().min(1), gs: nat, cp: nat, dps: nat, hps: nat,
  dano_recibido: nat, muertes: nat, crit_pct: pct, espalda_pct: pct,
  servidor: ent.nullable().optional(),   // v2
  en_grupo: z.boolean().optional(),      // v2
}).strict();
const dpsIntento = z.object({ intento: ent.positive(), jugador: nombre, dps: nat, muertes: nat }).strict();
const causa = z.object({ habilidad: hab, origen, muertes: ent.positive(), golpe_max: nat }).strict();
const casteo = z.object({ intento: ent.positive(), t: pos, habilidad: hab }).strict();

// Desde el 9/11/2026: los 10 s anteriores a cada muerte (ver db/raid.sql y lib/raids/repaso.ts). Los tiempos son
// segundos respecto a la muerte (negativos); en curas, jugador '' = alguien de fuera del grupo o una poción.
const antes = num.min(-10.1).max(0.2);
const repaso = z.object({
  vida_10s: num.min(0).max(100.5), vida: z.array(z.tuple([antes, num.min(0).max(100.5)])).max(300), vida_max: nat,
  golpes_10s: nat, dano_10s: nat,
  golpes: z.array(z.object({ t: antes, hab, dano: nat, mit: z.string().regex(/^[a-z-]{2,30}$/).nullable() }).strict()).max(12),
  cura_10s: nat,
  curas: z.array(z.object({ jugador: z.string().max(64), hab, cantidad: nat, n: ent.positive() }).strict()).max(5),
  escudo_10s: nat, companeros: nat, vivos: nat, sanadores: nat,
  defensivos: z.array(z.object({ hab, hace_s: pos.nullable(), recarga_s: pos.nullable() }).strict()).max(20),
}).strict();

const muerte = z.object({
  intento: ent.positive(), t: nat, habilidad: hab, origen, golpe_max: nat,
  // desde el 8/11/2026 (raids extraídas con la base): vida y daño/curación de los 5 s anteriores
  vida_5s: num.min(0).max(100.5).optional(), vida_1s: num.min(0).max(100.5).optional(),
  dano_5s: nat.optional(), cura_5s: nat.optional(),
  repaso: repaso.optional(),
}).strict();

const apoyo = z.object({
  curacion: nat, escudos: nat, absorbido: nat,
  cura_hab: z.array(z.object({ habilidad: hab, cantidad: nat, pct: pct, golpes: nat }).strict()),
  cura_obj: z.array(z.object({ jugador: nombre, cantidad: nat, pct: pct }).strict()),
  escudo_hab: z.array(z.object({ habilidad: hab, cantidad: nat }).strict()),
}).strict();

const contador = z.record(z.string().regex(/^[a-z-]{2,30}$/), nat);
const supervivencia = z.object({
  golpes: nat, cura_recibida: nat, escudo_recibido: nat, resurrecciones: nat, bajo30_pct: pct,
  mitigados: contador, evitados: contador,
}).strict();

const rotacion = z.object({
  usos: nat, interrumpidos: nat, vivo_s: nat, usos_min: pos, pausas_pct: pct, primer_golpe_s: pos.nullable(),
  usos_hab: z.array(z.object({ habilidad: hab, usos: nat, intervalo_s: pos.nullable() }).strict()),
  buffs: z.array(z.object({ habilidad: hab, activo_pct: pct, receptores: nat }).strict()),
}).strict();

const detalleJugador = z.object({
  habilidades: z.array(z.object({ habilidad: hab, dano: nat, pct: pct, golpes: nat, crit_pct: pct }).strict()),
  recibido: z.array(z.object({ habilidad: hab, dano: nat, golpes: nat, golpe_max: nat }).strict()),
  muertes: z.array(muerte),
  apoyo: apoyo.optional(),
  supervivencia: supervivencia.optional(),
  rotacion: rotacion.optional(),
}).strict();

// Desde el 9/11/2026: golpes directos que recibe el grupo de cada ataque. olas = veces que salió el ataque; por jugador,
// en cuántas le dio (olas) de las que le pillaron vivo (expuesto). Ver db/raid.sql y lib/raids/mecanicas.ts.
const mecanica = z.object({
  habilidad: hab, golpes: nat, olas: ent.positive(), alcance: pos,
  jugadores: z.array(z.object({ jugador: nombre, golpes: nat, olas: nat, expuesto: nat, dano: nat, golpe_max: nat }).strict()).min(1),
}).strict();

export const esquemaRaid = z.object({
  esquema_version: z.literal(2).optional(),
  sql_version: z.string().max(80).optional(),
  meta, resumen,
  otros: z.array(otro),
  intentos: z.array(intento).min(1),
  curva: z.array(puntoCurva),
  jugadores: z.array(jugador).min(1),
  dps_intento: z.array(dpsIntento),
  causas: z.array(causa),
  casteos: z.array(casteo),
  detalle: z.record(nombre, detalleJugador),
  mecanicas: z.array(mecanica).max(60).optional(),
}).strict().superRefine((d, ctx) => {
  const err = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (d.intentos.length !== d.resumen.intentos) err(['resumen', 'intentos'], `dice ${d.resumen.intentos} intentos y hay ${d.intentos.length}`);
  d.intentos.forEach((x, i) => { if (x.intento !== i + 1) err(['intentos', i, 'intento'], 'los intentos van numerados 1, 2, 3…'); });
  const nombres = new Set(d.jugadores.map((j) => j.jugador));
  if (nombres.size !== d.jugadores.length) err(['jugadores'], 'jugador repetido');
  for (const n of Object.keys(d.detalle)) if (!nombres.has(n)) err(['detalle', n], 'está en detalle pero no en jugadores');
  for (const n of nombres) if (!d.detalle[n]) err(['detalle'], `falta el detalle de ${n}`);
  const maxIntento = d.intentos.length;
  const fuera = (arr: { intento: number }[], campo: string) => arr.forEach((x, i) => { if (x.intento > maxIntento) err([campo, i], 'intento que no existe'); });
  fuera(d.curva, 'curva'); fuera(d.dps_intento, 'dps_intento'); fuera(d.casteos, 'casteos');
  d.dps_intento.forEach((x, i) => { if (!nombres.has(x.jugador)) err(['dps_intento', i], 'jugador desconocido'); });
  for (const [n, det] of Object.entries(d.detalle)) {
    det.apoyo?.cura_obj.forEach((o, i) => { if (!nombres.has(o.jugador)) err(['detalle', n, 'apoyo', 'cura_obj', i], 'jugador desconocido'); });
    det.muertes.forEach((m, i) => {
      if (m.intento > maxIntento) err(['detalle', n, 'muertes', i], 'intento que no existe');
      if (!m.repaso) return;
      if (m.repaso.vivos > m.repaso.companeros || m.repaso.sanadores > m.repaso.vivos) err(['detalle', n, 'muertes', i, 'repaso', 'vivos'], 'más vivos que compañeros');
      m.repaso.curas.forEach((c, k) => { if (c.jugador && !nombres.has(c.jugador)) err(['detalle', n, 'muertes', i, 'repaso', 'curas', k], 'jugador desconocido'); });
    });
  }
  const vistas = new Set<string>();
  (d.mecanicas ?? []).forEach((m, i) => {
    if (vistas.has(m.habilidad)) err(['mecanicas', i, 'habilidad'], 'habilidad repetida');
    vistas.add(m.habilidad);
    const suyos = new Set<string>();
    m.jugadores.forEach((j, k) => {
      if (!nombres.has(j.jugador)) err(['mecanicas', i, 'jugadores', k], 'jugador desconocido');
      if (suyos.has(j.jugador)) err(['mecanicas', i, 'jugadores', k], 'jugador repetido');
      suyos.add(j.jugador);
    });
  });
});

export type DatosRaid = z.infer<typeof esquemaRaid>;
export type Mecanica = z.infer<typeof mecanica>;
export type RepasoMuerte = z.infer<typeof repaso>;
export type DetalleJugador = z.infer<typeof detalleJugador>;

/** Valida y devuelve los datos tipados, o los problemas en texto legible (ruta: mensaje). */
export function validarRaid(json: unknown): { ok: true; datos: DatosRaid } | { ok: false; problemas: string[] } {
  const r = esquemaRaid.safeParse(json);
  if (r.success) return { ok: true, datos: r.data };
  return { ok: false, problemas: r.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) };
}
