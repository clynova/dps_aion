import { describe, expect, it } from 'vitest';
import { ajustesDe, PLAN_EJEMPLO } from '@/lib/simulador/ajustes';
import { codificarPlan, leerEnlace } from '@/lib/simulador/enlace';
import type { Plan } from '@/lib/simulador/ludra';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('enlace para compartir un plan', () => {
  it('ida y vuelta: jugadores, clases, caminos con sus salidas, ajustes y caso de Simular', () => {
    const plan: Plan = {
      jugadores: [
        { id: 'x', nombre: 'Ñora Ü', clase: 'cleric', ruta: [{ celda: { f: 0, k: 0 }, salida: 'rayo' }, { celda: { f: 5, k: 5 }, salida: 'pasar' }, { celda: { f: 2, k: 3 }, salida: { t: 12.5 } }] },
        { id: 'y', nombre: 'Sin clase', ruta: [{ celda: { f: 3, k: 1 }, salida: 'rayo' }] },
        { id: 'z', nombre: 'Sin colocar', ruta: [] },
      ],
    };
    const ajustes = { ...ajustesDe('prueba2'), velocidad: 2.5, orbes: 19, esquivar: false, impactos: [10, 14, 18] };
    const r = leerEnlace(codificarPlan(plan, ajustes, 7))!;
    expect(r.semilla).toBe(7);
    expect(r.ajustes).toEqual(ajustes);
    expect(r.plan.jugadores).toEqual([
      { id: 'j1', nombre: 'Ñora Ü', clase: 'cleric', ruta: plan.jugadores[0].ruta },
      { id: 'j2', nombre: 'Sin clase', ruta: plan.jugadores[1].ruta },
    ]);
  });

  it('el plan de ejemplo con los ajustes por defecto cabe en un enlace corto', () => {
    const codigo = codificarPlan(PLAN_EJEMPLO, ajustesDe('prueba1'));
    expect(codigo).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(codigo.length).toBeLessThan(500);
    expect(JSON.parse(Buffer.from(codigo, 'base64url').toString())).not.toHaveProperty('a');
    expect(leerEnlace(codigo)).toEqual({ plan: PLAN_EJEMPLO, ajustes: ajustesDe('prueba1'), semilla: 1 });
  });

  it('rechaza enlaces rotos o manipulados', () => {
    const ok = { v: 1, p: 'prueba1', j: [['A', '', 'A1 B2']] };
    expect(leerEnlace(b64(ok))).not.toBeNull();
    for (const malo of [
      { ...ok, v: 2 },
      { ...ok, p: 'prueba9' },
      { ...ok, j: [['A', '', 'G1']] },                       // fuera del tablero
      { ...ok, j: [['A', '', 'A7']] },
      { ...ok, j: [['A', '<script>', 'A1']] },               // clase con caracteres raros
      { ...ok, j: [['A'.repeat(30), '', 'A1']] },
      { ...ok, j: [['A', '', '']] },
      { ...ok, j: Array.from({ length: 13 }, () => ['A', '', 'A1']) },
      { ...ok, a: { velocidad: -1 } },
      { ...ok, a: { impactos: ['x'] } },
      { ...ok, a: { desconocido: 1 } },
      { ...ok, s: 1.5 },
    ]) expect(leerEnlace(b64(malo))).toBeNull();
    expect(leerEnlace('no es base64!')).toBeNull();
    expect(leerEnlace(b64('cadena'))).toBeNull();
    expect(leerEnlace('')).toBeNull();
  });
});
