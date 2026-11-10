import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { habilidadesPorJugador, resumenParaIA } from '@/lib/analisis/resumen';
import { validarRaid } from '@/lib/ingest/esquema';
import { analizarVentanas, ventanasParaIA, type VentanasDato } from '@/lib/raids/ventanas';

const grupo = ['Jugador1', 'Jugador2', 'Jugador3', 'Jugador4'];
const fila = (jugador: string, dano_rotura: number, s_rotura: number, dano_fuera: number, s_fuera: number, presentes = 2) =>
  ({ jugador, roturas: 2, presentes, dano_rotura, s_rotura, dano_fuera, s_fuera });
const v: VentanasDato = {
  roturas: [{ intento: 1, desde: 100, hasta: 110 }, { intento: 3, desde: 95.5, hasta: 105.5 }, { intento: 3, desde: 200, hasta: 210 }],
  jugadores: [
    fila('Jugador1', 1_000_000, 20, 5_000_000, 500),      // 50k frente a 10k: ×5
    fila('Jugador2', 400_000, 20, 5_000_000, 500),        // 20k frente a 10k: ×2
    fila('Jugador3', 200_000, 20, 5_000_000, 500),        // 10k frente a 10k: ×1
    fila('Jugador4', 30_000, 3, 4_000_000, 400, 1),       // 3 s vivo en rotura: sin DPS de rotura
    fila('Intruso', 900_000, 20, 1_000_000, 500),
  ],
  debuffs: [
    { jugador: 'Jugador2', habilidad: '14130000', activo_pct: 25.7, rotura_pct: 37.1 },
    { jugador: 'Jugador2', habilidad: '14050000', activo_pct: 56.9, rotura_pct: 46.3 },
    { jugador: 'Jugador3', habilidad: '15110000', activo_pct: 6.4, rotura_pct: 4.9 },     // menos del 10 %: fuera
    { jugador: 'Intruso', habilidad: '11170000', activo_pct: 80, rotura_pct: 80 },
  ],
};

describe('ventanas de daño', () => {
  const a = analizarVentanas(v, grupo);
  const de = (n: string) => a.jugadores.find((j) => j.jugador === n)!;

  it('cuenta las roturas, sus intentos y sus segundos', () => {
    expect(a).toMatchObject({ roturas: 3, intentos: 2, segundos: 30 });
  });

  it('calcula el DPS por segundo vivo dentro y fuera, y cuánto sube', () => {
    expect(de('Jugador1')).toMatchObject({ dpsRotura: 50000, dpsFuera: 10000, mult: 5, pctEnRotura: 16.7 });
    expect(de('Jugador3')).toMatchObject({ dpsRotura: 10000, dpsFuera: 10000, mult: 1 });
    // por DPS en rotura; sin dato, al final; solo el grupo
    expect(a.jugadores.map((j) => j.jugador)).toEqual(['Jugador1', 'Jugador2', 'Jugador3', 'Jugador4']);
  });

  it('no da DPS de rotura a quien apenas estuvo vivo en ella', () => {
    expect(de('Jugador4')).toMatchObject({ dpsRotura: null, mult: null, nivel: null, presentes: 1 });
  });

  it('destaca a quien sube bastante más o menos que el grupo', () => {
    // grupo: 1 630 000 / 63 s frente a 19 000 000 / 1900 s → ×2,59
    expect(a.grupo.mult).toBeCloseTo(2.587, 2);
    expect(de('Jugador1').nivel).toBe('alto');
    expect(de('Jugador2').nivel).toBe('bajo');
    expect(de('Jugador3').nivel).toBe('bajo');
    // con menos de 3 roturas no se destaca a nadie
    expect(analizarVentanas({ ...v, roturas: v.roturas.slice(0, 2) }, grupo).jugadores.every((j) => j.nivel === null)).toBe(true);
  });

  it('lista los debuffs del grupo que llegan al 10 %, de mayor a menor', () => {
    expect(a.debuffs).toEqual([{ jugador: 'Jugador2', lista: [
      { habilidad: '14050000', activo_pct: 56.9, rotura_pct: 46.3 }, { habilidad: '14130000', activo_pct: 25.7, rotura_pct: 37.1 },
    ] }]);
  });

  it('da a la IA las cifras ya comparadas', () => {
    const ia = ventanasParaIA(a);
    expect(ia.grupo.multiplicador).toBe(2.59);
    expect(ia.por_jugador[0]).toMatchObject({ jugador: 'Jugador1', roturas_vivo: '2 de 2', multiplicador: 5, frente_al_grupo: 'aprovecha la rotura más que el grupo' });
    expect(ia.debuffs_sobre_el_jefe).toHaveLength(2);
  });
});

describe('ventanas en el fixture anónimo', () => {
  const d = JSON.parse(readFileSync('tests/fixtures/raid-v2-anonima.json', 'utf8'));

  it('el esquema las acepta y rechaza las incoherentes', () => {
    expect(validarRaid(d).ok).toBe(true);
    const intruso = structuredClone(d); intruso.ventanas.debuffs[0].jugador = 'Intruso';
    expect(validarRaid(intruso).ok).toBe(false);
    const repetido = structuredClone(d); repetido.ventanas.jugadores[1].jugador = 'Jugador1';
    expect(validarRaid(repetido).ok).toBe(false);
    const alreves = structuredClone(d); alreves.ventanas.roturas[0].hasta = 10;
    expect(validarRaid(alreves).ok).toBe(false);
  });

  it('el esquema rechaza a un jugador repetido en el mismo intento', () => {
    const doble = structuredClone(d); doble.dps_intento.push({ ...doble.dps_intento[0] });
    const r = validarRaid(doble);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain('repetido en el mismo intento');
  });

  it('a la IA le llegan comparadas, no en crudo, y los debuffs cuentan como habilidades del jugador', () => {
    const r = resumenParaIA(d, { apodos: {}, habilidades: { '17080000': 'Estigma de prueba' }, npcs: {} }, []);
    expect(r.raid).not.toHaveProperty('ventanas');
    expect(r.ventanas_de_dano?.roturas_de_barra).toBe(1);
    expect(r.nombres['17080000']).toBe('Estigma de prueba');
    expect(habilidadesPorJugador(d).Jugador2.has('14130000')).toBe(true);
  });
});
