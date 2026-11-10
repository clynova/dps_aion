// Suma de las cifras públicas de lib/guia/cifras.ts (pura, para las pruebas).

export type CifrasJefe = {
  /** Raids (noches) en las que salió alguno de los npc */
  noches: number;
  grupos: number;
  intentos: number;
  /** Noches con kill de alguno de los npc (en una etiqueta de raid entera: kills de cualquier jefe, contados por jefe) */
  kills: number;
  /** Fecha ISO de la última noche */
  ultima: string | null;
};
export type FilaCifras = { npc: number; grupo: string; raid: string; intentos: number | null; matado: boolean; fecha: Date };

export function sumarCifras(filas: FilaCifras[], claves: Record<string, number[]>): Map<string, CifrasJefe> {
  const salida = new Map<string, CifrasJefe>();
  for (const [clave, npcs] of Object.entries(claves)) {
    const mios = new Set(npcs);
    const vistas = new Set<string>(); // raid + npc: una fila repetida no cuenta dos veces
    const noches = new Set<string>(), gruposVistos = new Set<string>();
    let intentos = 0, kills = 0, ultima = 0;
    for (const f of filas) {
      if (!mios.has(f.npc) || vistas.has(`${f.raid}/${f.npc}`)) continue;
      vistas.add(`${f.raid}/${f.npc}`);
      noches.add(f.raid);
      gruposVistos.add(f.grupo);
      intentos += f.intentos ?? 0;
      kills += f.matado ? 1 : 0;
      ultima = Math.max(ultima, +f.fecha);
    }
    if (noches.size) salida.set(clave, { noches: noches.size, grupos: gruposVistos.size, intentos, kills, ultima: new Date(ultima).toISOString() });
  }
  return salida;
}
