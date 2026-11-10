// Datos en vivo de la ficha de un jefe (módulo «Raids», fase 3): todas las raids públicas con ese jefe como principal,
// juntas, con lib/raids/jefe.ts (muro, cronograma, causas) y, para cada mecánica de la ficha, las muertes y el momento
// de sus ataques. Puro (sin base): se prueba en tests/unit/guia-datos.test.ts. Solo totales: ni grupos ni raids.
//
// Los % de la guía son de vida que le QUEDA al jefe (como en las fichas): vida = 100 − % de vida quitada.
import { analizarJefe, type AnalisisJefe, type AtaqueCronograma, type RaidJefe } from '@/lib/raids/jefe';

export type DatosMecanica = {
  /** Muertes por los ataques de la mecánica en todas las raids, y por intento */
  muertes: number; porIntento: number;
  /** El ataque de la mecánica que más intentos tiene en el cronograma: cuándo sale por primera vez y si se repite */
  momento: { habilidad: string; vida: number; segundo: number; cadaS: number | null; porVida: boolean; intentos: number; posibles: number } | null;
};
export type DatosJefeGuia = {
  analisis: AnalisisJefe;
  intentos: number;
  /** Kill más rápido, en segundos (null sin kill) */
  killMasRapido: number | null;
  mecanicas: Record<string, DatosMecanica>;
  /** Lo que más mata, con muertes por intento */
  causas: { habilidad: string; total: number; porIntento: number }[];
  /** El tramo de 5 % con más wipes, en vida que le queda al jefe */
  atasco: { desde: number; hasta: number; wipes: number; total: number; cierre: string | null } | null;
  /** Ataques que salen siempre al mismo % de vida (marcas del gráfico), de más vida a menos */
  porVida: { habilidad: string; vida: number }[];
};

const r2 = (x: number) => Math.round(x * 100) / 100;
export const vidaRestante = (pctQuitado: number) => Math.round((100 - pctQuitado) * 10) / 10;

/** Del cronograma, la entrada de esos ataques que más intentos tiene (a igualdad, la que sale antes). */
function momentoDe(cronograma: AtaqueCronograma[], ataques: number[]): DatosMecanica['momento'] {
  const ids = new Set(ataques.map(String));
  const mias = cronograma.filter((c) => ids.has(c.habilidad));
  if (!mias.length) return null;
  const c = mias.reduce((m, x) => (x.intentos > m.intentos || (x.intentos === m.intentos && x.primeroS < m.primeroS) ? x : m));
  const cadaS = c.cadaS ?? mias.find((x) => x.cadaS !== null)?.cadaS ?? null;
  return { habilidad: c.habilidad, vida: vidaRestante(c.primeroPct), segundo: c.primeroS, cadaS, porVida: c.disparador === 'vida', intentos: c.intentos, posibles: c.posibles };
}

export function datosJefeGuia(raids: RaidJefe[], mecanicas: { id: string; ataques: number[] }[]): DatosJefeGuia | null {
  if (!raids.length) return null;
  const analisis = analizarJefe(raids);
  const intentos = analisis.totales.intentos;

  const muertes = new Map<string, number>();
  for (const r of raids) for (const c of r.datos.causas ?? []) if (c.habilidad) muertes.set(c.habilidad, (muertes.get(c.habilidad) ?? 0) + c.muertes);
  const por = (n: number) => (intentos ? r2(n / intentos) : 0);

  const datosMec: Record<string, DatosMecanica> = {};
  for (const m of mecanicas) {
    if (!m.ataques.length) continue;
    const n = m.ataques.reduce((s, a) => s + (muertes.get(String(a)) ?? 0), 0);
    datosMec[m.id] = { muertes: n, porIntento: por(n), momento: momentoDe(analisis.cronograma, m.ataques) };
  }

  const causas = [...muertes].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6)
    .map(([habilidad, total]) => ({ habilidad, total, porIntento: por(total) }));

  const totalWipes = analisis.muro.reduce((s, m) => s + m.wipes, 0);
  const peor = analisis.muro.reduce<AnalisisJefe['muro'][number] | null>((m, x) => (!m || x.wipes > m.wipes ? x : m), null);
  const atasco = peor && peor.wipes ? { desde: 100 - peor.desde, hasta: 95 - peor.desde, wipes: peor.wipes, total: totalWipes, cierre: peor.cierre?.habilidad ?? null } : null;

  const kills = analisis.noches.map((n) => n.killS).filter((k): k is number => k !== null);
  return {
    analisis, intentos, killMasRapido: kills.length ? Math.min(...kills) : null, mecanicas: datosMec, causas, atasco,
    porVida: analisis.cronograma.filter((c) => c.disparador === 'vida' && c.primeroPct >= 5).map((c) => ({ habilidad: c.habilidad, vida: vidaRestante(c.primeroPct) }))
      .sort((a, b) => b.vida - a.vida),
  };
}
