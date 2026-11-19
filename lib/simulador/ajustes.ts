// Ajustes de la pestaña «Simulador» (lo que se cambia en su panel Ajustes) y cómo se convierten en la Config del motor
// (lib/simulador/ludra.ts), más el plan de ejemplo. Puro: lo usan el componente y el enlace para compartir (enlace.ts).
import { PELIGROS, PRESETS, type Config, type Parada, type Plan } from './ludra';

export type Prueba = keyof typeof PRESETS;
export type Ajustes = {
  prueba: Prueba; velocidad: number; impactos: number[]; aviso: number; margen: number; reaccion: number; final: number;
  alFallar: 'muere' | 'marca';
  /** Segundo del impacto de los orbes o del rayo de esquina (null: apagados) */
  orbes: number | null; esquina: number | null;
  esquivar?: boolean;
};

export function ajustesDe(prueba: Prueba): Ajustes {
  const p = PRESETS[prueba], ultima = p.tandas[p.tandas.length - 1];
  return {
    prueba, velocidad: p.velocidad, impactos: p.tandas.map((x) => x.impacto), aviso: ultima ? ultima.impacto - ultima.aviso : 2.5,
    margen: p.margen, reaccion: p.reaccion, final: p.final, alFallar: p.alFallar,
    orbes: p.orbes[0]?.impacto ?? null, esquina: p.rayoEsquina?.impacto ?? null, esquivar: p.esquivar,
  };
}

export function configDe(a: Ajustes): Config {
  const p = PRESETS[a.prueba], peligros = PELIGROS[a.prueba];
  const impactos = a.impactos.filter((x) => x > 0).sort((x, y) => x - y);
  const antes = (o: { aviso: number; impacto: number }) => o.impacto - o.aviso;
  return {
    ...p, velocidad: Math.max(0.2, a.velocidad), margen: Math.max(0, a.margen), reaccion: Math.max(0, a.reaccion), alFallar: a.alFallar,
    esquivar: a.esquivar ?? p.esquivar,
    final: Math.max(a.final, (impactos[impactos.length - 1] ?? 0) + 0.5),
    tandas: impactos.map((impacto) => ({ aviso: Math.max(0, impacto - a.aviso), impacto })),
    orbes: a.orbes === null ? [] : peligros.orbes.map((o) => ({ ...o, aviso: Math.max(0, a.orbes! - antes(o)), impacto: a.orbes! })),
    rayoEsquina: a.esquina === null ? null
      : { ...peligros.rayoEsquina, aviso: Math.max(0, a.esquina - antes(peligros.rayoEsquina)), impacto: a.esquina },
  };
}

// Plan de ejemplo: parejas desde cada esquina recorriendo su borde, una casilla nueva por tanda, y una pareja por el
// centro. Destapa el tablero entero y sale bien en los 36 casos con los tiempos por defecto.
const ruta = (...cs: [number, number][]): Parada[] => cs.map(([f, k]) => ({ celda: { f, k }, salida: 'rayo' }));
export const PLAN_EJEMPLO: Plan = {
  jugadores: [
    { id: 'j1', nombre: '1A', ruta: ruta([0, 0], [0, 1], [0, 2], [0, 3]) },
    { id: 'j2', nombre: '1B', ruta: ruta([1, 0], [1, 1], [1, 2], [1, 3]) },
    { id: 'j3', nombre: '2A', ruta: ruta([0, 5], [1, 5], [2, 5], [3, 5]) },
    { id: 'j4', nombre: '2B', ruta: ruta([0, 4], [1, 4], [2, 4], [3, 4]) },
    { id: 'j5', nombre: '3A', ruta: ruta([5, 0], [4, 0], [3, 0], [2, 0]) },
    { id: 'j6', nombre: '3B', ruta: ruta([5, 1], [4, 1], [3, 1], [2, 1]) },
    { id: 'j7', nombre: '4A', ruta: ruta([5, 5], [5, 4], [5, 3], [5, 2]) },
    { id: 'j8', nombre: '4B', ruta: ruta([4, 5], [4, 4], [4, 3], [4, 2]) },
    { id: 'j9', nombre: 'C1', ruta: ruta([2, 2], [2, 3], [2, 2], [2, 3]) },
    { id: 'j10', nombre: 'C2', ruta: ruta([3, 2], [3, 3], [3, 2], [3, 3]) },
  ],
};
