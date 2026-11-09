import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validarRaid } from '@/lib/ingest/esquema';

const leer = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
// Formato v1 (el de la web estática): una raid real con los nombres de jugador sustituidos

describe('esquema de subida', () => {
  it('acepta el formato v1 de la web estática', () => {
    const r = validarRaid(leer('tests/fixtures/raid-v1-anonima.json'));
    expect(r.ok ? [] : r.problemas).toEqual([]);
  });
  it('acepta el formato nuevo con apoyo, supervivencia y rotación', () => {
    const r = validarRaid(leer('tests/fixtures/raid-v2-anonima.json'));
    expect(r.ok ? [] : r.problemas).toEqual([]);
  });
  it('rechaza claves desconocidas, intentos incoherentes y jugadores que no existen', () => {
    const base = leer('tests/fixtures/raid-v2-anonima.json');
    const conClave = { ...base, inventado: 1 };
    expect(validarRaid(conClave).ok).toBe(false);
    const malIntentos = { ...base, resumen: { ...base.resumen, intentos: 7 } };
    const r1 = validarRaid(malIntentos);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.problemas.join()).toMatch(/resumen\.intentos/);
    const fantasma = { ...base, dps_intento: [...base.dps_intento, { intento: 1, jugador: 'Nadie', dps: 1, muertes: 0 }] };
    expect(validarRaid(fantasma).ok).toBe(false);
  });
  it('rechaza porcentajes imposibles y negativos', () => {
    const base = leer('tests/fixtures/raid-v2-anonima.json');
    const j0 = { ...base.jugadores[0], crit_pct: 140 };
    expect(validarRaid({ ...base, jugadores: [j0, ...base.jugadores.slice(1)] }).ok).toBe(false);
    const j1 = { ...base.jugadores[0], dps: -5 };
    expect(validarRaid({ ...base, jugadores: [j1, ...base.jugadores.slice(1)] }).ok).toBe(false);
  });
});

describe('análisis', async () => {
  const { esquemaAnalisis } = await import('@/lib/ingest/analisis');
  const archivos = ['tests/fixtures/analisis-v1-anonimo.json', 'tests/fixtures/analisis-v1-anonimo.en.json'];
  it.each(archivos)('acepta %s', (p) => {
    const r = esquemaAnalisis.safeParse(leer(p));
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([]);
  });
});
