import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { construirPerfiles, redondeoNet, slugJugador } from '@/lib/perfil/construir';

describe('redondeo como Math.Round de .NET Framework (PowerShell 5.1)', () => {
  it('al par en los .5 exactos', () => {
    expect(redondeoNet(2.5)).toBe(2);
    expect(redondeoNet(3.5)).toBe(4);
    expect(redondeoNet(-2.5)).toBe(-2);
    expect(redondeoNet(0.125, 2)).toBe(0.12);
  });
  it('escala y luego redondea (los errores binarios cuentan, igual que en .NET)', () => {
    expect(redondeoNet(2.45, 1)).toBe(2.4);   // 2.45 × 10 = 24.5 exacto → al par: 24
    expect(redondeoNet(1.005, 2)).toBe(1);    // 100.49999999999999 → 100
    expect(redondeoNet(40366.4)).toBe(40366);
    expect(redondeoNet(1.27, 2)).toBe(1.27);
  });
});

describe('perfiles', () => {
  it('slug como Slugify de perfiles.ps1', () => {
    expect(slugJugador('FunPeople')).toBe('funpeople');
    expect(slugJugador('Ñandú Élite')).toBe('nandu-elite');
  });
  it('con datos nuevos: apoyo, supervivencia y rotación, y comparaciones con su clase', () => {
    const raid = JSON.parse(readFileSync('tests/fixtures/raid-v2-anonima.json', 'utf8'));
    const { perfiles, indice } = construirPerfiles([raid]);
    expect(indice).toHaveLength(raid.jugadores.length);
    const j = raid.jugadores[0].jugador;
    const p = perfiles[j];
    expect(p.resumen.raids).toBe(1);
    expect(p.raids[0].clase_media.jugadores).toBeGreaterThanOrEqual(1);
    expect(p.supervivencia.raids).toBe(1);
    expect(p.rotacion.raids).toBe(1);
    expect(p.raids[0].grupo_media).toHaveProperty('usos_min');
  });
});
