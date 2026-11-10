// Especializaciones de cada jugador frente a las de los demás de su clase. Salen de «especializaciones» del data.json
// (db/raid.sql): el sufijo del casteo de cada habilidad dice qué opciones eligió (17352450 = opciones 2, 4 y 5 de
// 17350000). Es una regla deducida de los datos. Aquí no se le atribuye DPS a ninguna opción: con dos o tres jugadores
// por clase, la diferencia de daño depende de mucho más. Puro (sin base ni red): tests/unit/especializaciones.test.ts.

export type EspecializacionDato = { jugador: string; habilidad: string; opciones: string; usos: number };
/** Lo que se compara de un jugador: sus opciones por habilidad (y de qué raid salen, en el perfil) */
export type Ficha = { jugador: string; opciones: Record<string, string>; usos: Record<string, number>; fecha?: string; slug?: string };

export type Estado = 'igual' | 'distinta' | 'variada' | null;
export type FilaHabilidad = {
  habilidad: string;
  /** Opciones de cada jugador (en el orden de `jugadores`), null si no la usó con especialización */
  opciones: (string | null)[];
  /** Por jugador: igual que la mayoría, distinta de la mayoría, o variada (no hay mayoría); null si no la usa */
  estado: Estado[];
};
export type TablaClase = { clase: string; jugadores: string[]; filas: FilaHabilidad[]; distintas: number };

/** «245» → «2·4·5» (con el separador que se pida). */
export const formatoOpciones = (o: string, sep = '·') => o.split('').join(sep);

/** Fichas de los jugadores de una raid (solo los de `grupo`). */
export function fichasDeRaid(esp: EspecializacionDato[], grupo: string[]): Ficha[] {
  const por = new Map<string, Ficha>();
  for (const e of esp) {
    if (!grupo.includes(e.jugador)) continue;
    const f = por.get(e.jugador) ?? { jugador: e.jugador, opciones: {}, usos: {} };
    f.opciones[e.habilidad] = e.opciones; f.usos[e.habilidad] = e.usos;
    por.set(e.jugador, f);
  }
  return [...por.values()];
}

/**
 * Tabla de una clase: una fila por habilidad que alguno usa con especialización (las más usadas primero). Con dos
 * jugadores o más se marca quién se aparta de la mayoría; sin mayoría (por ejemplo, dos jugadores con opciones
 * distintas), la fila es «variada».
 */
export function tablaClase(clase: string, fichas: Ficha[]): TablaClase {
  const jugadores = fichas.map((f) => f.jugador);
  const usos = new Map<string, number>();
  for (const f of fichas) for (const [h, n] of Object.entries(f.usos)) usos.set(h, (usos.get(h) ?? 0) + n);
  const filas = [...usos].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([habilidad]) => {
    const opciones = fichas.map((f) => f.opciones[habilidad] ?? null);
    const presentes = opciones.filter((o): o is string => o !== null);
    const cuenta = new Map<string, number>();
    for (const o of presentes) cuenta.set(o, (cuenta.get(o) ?? 0) + 1);
    const [top, n] = [...cuenta].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    const mayoria = presentes.length >= 2 && n * 2 > presentes.length ? top : null;
    const estado: Estado[] = opciones.map((o) => (o === null || presentes.length < 2 ? null
      : cuenta.size === 1 ? 'igual' : mayoria === null ? 'variada' : o === mayoria ? 'igual' : 'distinta'));
    return { habilidad, opciones, estado };
  });
  return { clase, jugadores, filas, distintas: filas.filter((f) => f.estado.some((e) => e === 'distinta' || e === 'variada')).length };
}

/** Las tablas de una raid, por clase (las clases con más jugadores primero). */
export function analizarEspecializaciones(esp: EspecializacionDato[], jugadores: { jugador: string; clase_id: string | null }[], grupo: string[]): TablaClase[] {
  const fichas = fichasDeRaid(esp, grupo);
  const claseDe = new Map(jugadores.map((j) => [j.jugador, j.clase_id]));
  const porClase = new Map<string, Ficha[]>();
  for (const f of fichas) {
    const c = claseDe.get(f.jugador);
    if (c) porClase.set(c, [...(porClase.get(c) ?? []), f]);
  }
  return [...porClase].map(([c, fs]) => tablaClase(c, fs.sort((a, b) => (a.jugador < b.jugador ? -1 : 1))))
    .sort((a, b) => b.jugadores.length - a.jugadores.length || (a.clase < b.clase ? -1 : 1));
}

type RaidConEsp = { slug: string; fecha: string; datos: { jugadores?: { jugador: string; clase_id: string | null }[]; meta?: { grupo?: string[] }; especializaciones?: EspecializacionDato[] } };

/**
 * Para el perfil: la ficha más reciente del jugador frente a la más reciente de cada otro jugador de su clase en las
 * raids que se pueden ver. null si ninguna raid suya trae especializaciones.
 */
export function especializacionesDePerfil(raids: RaidConEsp[], nombre: string): (TablaClase & { suya: { slug: string; fecha: string }; fechas: string[] }) | null {
  const orden = [...raids].filter((r) => r.datos.especializaciones?.length).sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
  const deRaid = (r: RaidConEsp, j: string) => fichasDeRaid(r.datos.especializaciones ?? [], [j])[0];
  const suya = orden.find((r) => deRaid(r, nombre));
  if (!suya) return null;
  const clase = suya.datos.jugadores?.find((j) => j.jugador === nombre)?.clase_id;
  if (!clase) return null;
  const fichas: Ficha[] = [{ ...deRaid(suya, nombre), fecha: suya.fecha, slug: suya.slug }];
  const vistos = new Set([nombre]);
  for (const r of orden) {
    for (const j of r.datos.jugadores ?? []) {
      if (j.clase_id !== clase || vistos.has(j.jugador) || !(r.datos.meta?.grupo ?? []).includes(j.jugador)) continue;
      const f = deRaid(r, j.jugador);
      if (f) { fichas.push({ ...f, fecha: r.fecha, slug: r.slug }); vistos.add(j.jugador); }
    }
  }
  // fechas: de qué raid sale la ficha de cada jugador (en el orden de la tabla)
  return { ...tablaClase(clase, fichas), suya: { slug: suya.slug, fecha: suya.fecha }, fechas: fichas.map((f) => f.fecha!) };
}

/** Para la IA: solo las habilidades en que un jugador se aparta de los de su clase, con las opciones de cada uno. */
export function especializacionesParaIA(tablas: TablaClase[]) {
  return tablas.filter((t) => t.jugadores.length >= 2).flatMap((t) => t.filas.flatMap((f) => f.estado.flatMap((e, k) => (e === 'distinta' || e === 'variada' ? [{
    jugador: t.jugadores[k], clase: t.clase, habilidad: f.habilidad, sus_opciones: formatoOpciones(f.opciones[k]!, ', '),
    los_demas_de_su_clase: t.jugadores.flatMap((j, i) => (i !== k && f.opciones[i] ? [`${j}: ${formatoOpciones(f.opciones[i]!, ', ')}`] : [])),
  }] : []))));
}
