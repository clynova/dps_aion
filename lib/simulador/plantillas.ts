// Plantillas de reparto del tablero para la pestaña «Simulador» (docs/plan-simulador-ludra.md). Cada una trae los
// caminos de 10 huecos, el rol de cada hueco (para colocar a los jugadores de la lista según su clase) y, si las usa,
// dónde van las marcas 1–4 del juego. Puro: pruebas en tests/unit/simulador-plantillas.test.ts.
import { PLAN_EJEMPLO } from './ajustes';
import type { Celda, JugadorPlan, Parada, Plan } from './ludra';

export type Rol = 'tanque' | 'sanador' | 'dps';
export type Hueco = { nombre: string; rol?: Rol; ruta: Parada[] };
export type Plantilla = { huecos: Hueco[]; marcas?: Celda[] };

const ruta = (...cs: [number, number][]): Parada[] => cs.map(([f, k]) => ({ celda: { f, k }, salida: 'rayo' }));

/** Clases de cada rol, por orden de preferencia: si una party trae Clérigo y Cantor, el hueco de sanador es del Clérigo */
const CLASES: Record<Exclude<Rol, 'dps'>, string[]> = { tanque: ['templar', 'gladiator'], sanador: ['cleric', 'chanter'] };

export const PLANTILLAS = {
  // La del grupo en Difícil: parejas desde cada esquina recorriendo su borde y una pareja por el centro
  dificil: { huecos: PLAN_EJEMPLO.jugadores.map((j) => ({ nombre: j.nombre, ruta: j.ruta })) },
  // La del grupo en Normal (imagen del 19/11/2026): marcas 1–4 en B4–E4, la party 1 en ellas y la 2 detrás (fila 3); las
  // dos filas caminan hacia fuera, una casilla por tanda, hasta el borde, y los sanadores recorren su columna entera
  // desde esquinas opuestas (A6 → A1 y F1 → F6). Con 4 tandas, A1–A2 y F5–F6 no llegan a destaparse.
  normal: {
    marcas: [{ f: 3, k: 1 }, { f: 3, k: 2 }, { f: 3, k: 3 }, { f: 3, k: 4 }],
    huecos: [
      { nombre: 'T1', rol: 'tanque', ruta: ruta([3, 1], [4, 1], [5, 1]) },
      { nombre: 'D1', rol: 'dps', ruta: ruta([3, 2], [4, 2], [5, 2]) },
      { nombre: 'D2', rol: 'dps', ruta: ruta([3, 3], [4, 3], [5, 3]) },
      { nombre: 'D3', rol: 'dps', ruta: ruta([3, 4], [4, 4], [5, 4]) },
      { nombre: 'H1', rol: 'sanador', ruta: ruta([5, 0], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0]) },
      { nombre: 'T2', rol: 'tanque', ruta: ruta([2, 1], [1, 1], [0, 1]) },
      { nombre: 'D4', rol: 'dps', ruta: ruta([2, 2], [1, 2], [0, 2]) },
      { nombre: 'D5', rol: 'dps', ruta: ruta([2, 3], [1, 3], [0, 3]) },
      { nombre: 'D6', rol: 'dps', ruta: ruta([2, 4], [1, 4], [0, 4]) },
      { nombre: 'H2', rol: 'sanador', ruta: ruta([0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5]) },
    ],
  },
} satisfies Record<string, Plantilla>;
export type NombrePlantilla = keyof typeof PLANTILLAS;
const NOMBRES_HUECO = new Set(Object.values(PLANTILLAS).flatMap((p: Plantilla) => p.huecos.map((h) => h.nombre)));

const rolDe = (clase?: string): Rol | null => {
  for (const r of ['tanque', 'sanador'] as const) if (clase && CLASES[r].includes(clase)) return r;
  return clase ? 'dps' : null;
};

/**
 * El plan de una plantilla con los jugadores de la lista: cada uno conserva su nombre, su clase y su sitio en la lista
 * y toma el camino de un hueco. Primero los huecos de tanque y de sanador, para las clases de ese rol por orden de
 * preferencia y, dentro de cada clase, por orden de la lista (los primeros, de la party 1); luego, por orden, el resto
 * (mejor alguien que no sea tanque ni sanador). Los que sobran se quedan sin colocar; si faltan jugadores, los huecos
 * libres entran al final con el nombre del hueco.
 */
export function aplicarPlantilla(plantilla: Plantilla, jugadores: JugadorPlan[]): Plan {
  const hueco = new Map<string, number>(), lleno = new Set<number>();
  const poner = (j: JugadorPlan | undefined, i: number) => { if (j) { hueco.set(j.id, i); lleno.add(i); } };
  for (const r of ['tanque', 'sanador'] as const) {
    const candidatos = CLASES[r].flatMap((c) => jugadores.filter((j) => j.clase === c));
    plantilla.huecos.forEach((h, i) => { if (h.rol === r) poner(candidatos.find((x) => !hueco.has(x.id)), i); });
  }
  plantilla.huecos.forEach((_, i) => {
    if (lleno.has(i)) return;
    const libres = jugadores.filter((x) => !hueco.has(x.id));
    poner(libres.find((x) => rolDe(x.clase) !== 'tanque' && rolDe(x.clase) !== 'sanador') ?? libres[0], i);
  });
  let n = Math.max(0, ...jugadores.map((j) => Number(j.id.slice(1)) || 0));
  return {
    jugadores: [
      ...jugadores.map((j) => {
        const h = hueco.has(j.id) ? plantilla.huecos[hueco.get(j.id)!] : null;
        // Quien aún lleva el nombre de un hueco (de esta u otra plantilla) o un número pasa a llamarse como su hueco
        const generico = !j.clase && (/^\d+$/.test(j.nombre) || NOMBRES_HUECO.has(j.nombre));
        return { ...j, nombre: h && generico ? h.nombre : j.nombre, ruta: h ? h.ruta : [] };
      }),
      ...plantilla.huecos.flatMap((h, i) => (lleno.has(i) ? [] : [{ id: `j${++n}`, nombre: h.nombre, ruta: h.ruta }])),
    ],
    ...(plantilla.marcas ? { marcas: plantilla.marcas } : {}),
  };
}
