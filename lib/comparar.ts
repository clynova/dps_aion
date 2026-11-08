// Compara dos JSON por contenido, como tools/comparar-json.ps1: mismas claves y valores, números con tolerancia 1e-9.
// `ignorar`: rutas sin índices (p. ej. 'meta.extraido'). `sinOrden`: listas cuyo orden no importa (se ordenan por su
// contenido antes de comparar). Devuelve la lista de diferencias (vacía si son iguales).
type Opciones = { ignorar?: string[]; sinOrden?: string[]; max?: number };

export function compararJson(a: unknown, b: unknown, opciones: Opciones = {}): string[] {
  const ignorar = new Set(opciones.ignorar ?? []), sinOrden = new Set(opciones.sinOrden ?? []);
  const max = opciones.max ?? 200;
  const dif: string[] = [];
  const clave = (x: unknown) => JSON.stringify(x, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
  const sinIndices = (ruta: string) => ruta.replace(/\[\d+\]/g, '').replace(/^\./, '');
  const esObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

  const ir = (x: unknown, y: unknown, ruta: string) => {
    if (dif.length >= max) return;
    const r = sinIndices(ruta);
    if (ignorar.has(r)) return;
    if (x === null || x === undefined || y === null || y === undefined) {
      if ((x ?? null) !== (y ?? null)) dif.push(`${ruta} : ${clave(x)} <> ${clave(y)}`);
      return;
    }
    if (Array.isArray(x) || Array.isArray(y)) {
      let xa = Array.isArray(x) ? x : [x], ya = Array.isArray(y) ? y : [y];
      if (sinOrden.has(r)) { const s = (l: unknown[]) => [...l].sort((p, q) => (clave(p) < clave(q) ? -1 : clave(p) > clave(q) ? 1 : 0)); xa = s(xa); ya = s(ya); }
      if (xa.length !== ya.length) dif.push(`${ruta} : ${xa.length} elementos <> ${ya.length}`);
      for (let i = 0; i < Math.min(xa.length, ya.length); i++) ir(xa[i], ya[i], `${ruta}[${i}]`);
      return;
    }
    if (esObj(x) && esObj(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (!(k in x) || !(k in y)) { if (!ignorar.has(sinIndices(`${ruta}.${k}`))) dif.push(`${ruta}.${k} : falta en ${k in x ? 'B' : 'A'}`); continue; }
        ir(x[k], y[k], `${ruta}.${k}`);
      }
      return;
    }
    if (typeof x === 'number' && typeof y === 'number') { if (Math.abs(x - y) > 1e-9) dif.push(`${ruta} : ${x} <> ${y}`); return; }
    if (x !== y || typeof x !== typeof y) dif.push(`${ruta} : ${clave(x)} <> ${clave(y)}`);
  };
  ir(a, b, '');
  return dif;
}
