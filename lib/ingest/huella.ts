// Huella de una raid: detecta la misma noche subida dos veces por personas distintas del grupo. Cada PC genera su
// propio run_id, así que se compara lo que no depende de quién grabó: jefe, día, quién estaba y cuánto duró cada
// intento (redondeado a 10 s, porque dos grabaciones pueden diferir en algún segundo).
import { createHash } from 'node:crypto';
import type { DatosRaid } from './esquema';

export function huellaRaid(d: DatosRaid): string {
  const partes = [
    d.meta.npc,
    d.meta.fecha.slice(0, 10),
    [...d.meta.grupo].sort().join(','),
    d.intentos.map((i) => Math.round(i.duracion_s / 10)).join(','),
  ];
  return createHash('sha256').update(partes.join('|')).digest('hex').slice(0, 32);
}

/** Slug de jugador, igual que Slugify de tools/perfiles.ps1 (sin tildes, minúsculas, guiones). */
export function slugJugador(nombre: string): string {
  return nombre.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
