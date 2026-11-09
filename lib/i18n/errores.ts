// Textos de error que pueden devolver las acciones de grupos, ya traducidos, para pasarlos a <Formulario>.
import type { Clave, Traductor } from './index';

const CLAVES: Clave[] = [
  'comun.error', 'comun.sinPermiso', 'comun.entrarPrimero',
  'grupos.error.nombre', 'grupos.error.slug', 'grupos.error.slugOcupado', 'unirse.invalida', 'ajustes.borrar.noCoincide',
  'ajustes.webhook.invalido', 'ajustes.webhook.inexistente',
];

export const textosError = (t: Traductor) => Object.fromEntries(CLAVES.map((k) => [k, t(k)]));
