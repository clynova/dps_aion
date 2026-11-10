import { describe, expect, it } from 'vitest';
import { datosJefeGuia, equipoJefe, vidaRestante, type RaidConGrupo } from '@/lib/guia/datos-jefe';
import type { IntentoJefe, RaidJefe } from '@/lib/raids/jefe';

// Dos noches inventadas. En cada intento: 1800100 a los 10 s (por tiempo), 1800200 al 20 % de vida quitada (por vida)
// y cada 30 s, y su impacto 1800205 un poco después. Mata sobre todo 1800205.
const intento = (n: number, progreso_pct: number, duracion_s: number, ultima_causa = '1800205', matado = false): IntentoJefe =>
  ({ intento: n, duracion_s, progreso_pct, matado, muertes: 4, ultima_causa });
const raid = (slug: string, fecha: string, its: IntentoJefe[], causas: RaidJefe['datos']['causas'], ritmos: number[]): RaidConGrupo => ({
  slug, fecha,
  datos: {
    resumen: { dps_grupo_medio: 100_000, muertes_grupo: its.length * 4, kill_s: its.find((i) => i.matado)?.duracion_s ?? null },
    intentos: its,
    curva: its.flatMap((i, x) => [{ intento: i.intento, t: 0, progreso: 0 }, { intento: i.intento, t: (i.matado ? 100 : i.progreso_pct) * ritmos[x], progreso: i.matado ? 100 : i.progreso_pct }]),
    casteos: its.flatMap((i, x) => {
      const fin = (i.matado ? 100 : i.progreso_pct) * ritmos[x];
      return [
        { intento: i.intento, t: 10, habilidad: '1800100' },
        ...[20 * ritmos[x], 20 * ritmos[x] + 30, 20 * ritmos[x] + 60].filter((t) => t < fin).flatMap((t) => [
          { intento: i.intento, t, habilidad: '1800200' }, { intento: i.intento, t: t + 2, habilidad: '1800205' },
        ]),
      ];
    }),
    causas,
  },
});

const n1 = raid('n1', '2026-11-08T21:00:00-03:00', [intento(1, 47, 100), intento(2, 52, 110), intento(3, 48, 90, '1800300')],
  [{ habilidad: '1800205', muertes: 7 }, { habilidad: '1800300', muertes: 2 }], [2, 1.5, 3]);
const n2 = raid('n2', '2026-11-09T21:00:00-03:00', [intento(1, 46, 95), intento(2, 100, 230, '', true)],
  [{ habilidad: '1800205', muertes: 3 }], [2, 2.5]);

describe('datos de la ficha del jefe', () => {
  const d = datosJefeGuia([n1, n2], [
    { id: 'zona', ataques: [1800200, 1800205] },
    { id: 'apertura', ataques: [1800100] },
    { id: 'texto', ataques: [] },
  ])!;

  it('vida que queda = 100 − vida quitada', () => {
    expect(vidaRestante(20)).toBe(80);
    expect(vidaRestante(75.3)).toBe(24.7);
  });
  it('muertes por mecánica y por intento, de todas las raids', () => {
    expect(d.intentos).toBe(5);
    expect(d.mecanicas.zona).toMatchObject({ muertes: 10, porIntento: 2 });
    expect(d.mecanicas.apertura).toMatchObject({ muertes: 0, porIntento: 0 });
    expect(d.mecanicas.texto).toBeUndefined();
  });
  it('momento: el ataque con más intentos, en vida que queda, con su repetición', () => {
    expect(d.mecanicas.zona.momento).toMatchObject({ vida: 80, porVida: true, cadaS: 30, intentos: 5 });
    expect(d.mecanicas.apertura.momento).toMatchObject({ segundo: 10, porVida: false, cadaS: null });
    expect(d.porVida.map((p) => p.vida)).toContain(80);
  });
  it('lo que más mata, el kill más rápido y el atasco en vida que queda', () => {
    expect(d.causas[0]).toEqual({ habilidad: '1800205', total: 10, porIntento: 2 });
    expect(d.killMasRapido).toBe(230);
    // 4 wipes: 47, 52, 48, 46 % quitado → tramo 45–50 % quitado (3) = 55–50 % de vida que queda
    expect(d.atasco).toEqual({ desde: 55, hasta: 50, wipes: 3, total: 4, cierre: '1800205' });
  });
  it('sin raids, nada', () => {
    expect(datosJefeGuia([], [])).toBeNull();
  });
});

describe('equipo y grupo', () => {
  const j = (jugador: string, clase_id: string, gs: number, crit_pct: number) => ({ jugador, clase_id, gs, crit_pct });
  const base = (slug: string, matado: boolean) => raid(slug, '2026-11-09T21:00:00-03:00', [intento(1, 40, 90), intento(2, matado ? 100 : 60, 200, '', matado)], [], [2, 2]);
  const r1 = base('a', true), r2 = base('b', false);
  r1.datos = { ...r1.datos, jugadores: [j('T', 'templar', 3000, 30), j('C', 'cleric', 2900, 40), j('A', 'assassin', 3100, 70), j('B', 'assassin', 2850, 0)],
    dps_intento: [{ intento: 1, jugador: 'T' }, { intento: 1, jugador: 'B' }, { intento: 2, jugador: 'T' }, { intento: 2, jugador: 'C' }, { intento: 2, jugador: 'A' }] };
  r2.datos = { ...r2.datos, jugadores: [j('T', 'templar', 3010, 34), j('X', 'cleric', 2800, 20)], dps_intento: [{ intento: 1, jugador: 'T' }, { intento: 2, jugador: 'X' }] };
  it('composición: solo los del intento del kill', () => {
    const e = equipoJefe([r1, r2]);
    expect(e.kills).toEqual([{ templar: 1, cleric: 1, assassin: 1 }]);
    expect(e.clasesKill.map((c) => c.clase).sort()).toEqual(['assassin', 'cleric', 'templar']);
  });
  it('GS de los kills y de todos', () => {
    const e = equipoJefe([r1, r2]);
    expect(e.gsKill).toEqual({ min: 2900, mediana: 3000, max: 3100, n: 3 });
    expect(e.gsTodos).toMatchObject({ min: 2800, max: 3100, n: 6 });
  });
  it('crítico por clase, sin los 0 (sin golpes al jefe)', () => {
    const e = equipoJefe([r1, r2]);
    expect(e.critico).toEqual([
      { clase: 'assassin', mediana: 70, min: 70, max: 70, n: 1 },
      { clase: 'templar', mediana: 32, min: 30, max: 34, n: 2 },
      { clase: 'cleric', mediana: 30, min: 20, max: 40, n: 2 },
    ]);
  });
  it('sin kills, sin composición', () => {
    expect(equipoJefe([r2]).kills).toEqual([]);
    expect(equipoJefe([r2]).gsKill).toBeNull();
  });
});
