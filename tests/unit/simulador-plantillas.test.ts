import { describe, expect, it } from 'vitest';
import { ajustesDe, PLAN_EJEMPLO } from '@/lib/simulador/ajustes';
import { codificarPlan, leerEnlace } from '@/lib/simulador/enlace';
import { cobertura, PRESETS, probarTodas, type JugadorPlan } from '@/lib/simulador/ludra';
import { aplicarPlantilla, PLANTILLAS } from '@/lib/simulador/plantillas';

const nombres = (n: number) => Array.from({ length: n }, (_, i): JugadorPlan => ({ id: `j${i + 1}`, nombre: `x${i + 1}`, ruta: [] }));

describe('plantillas del simulador', () => {
  it('la de Difícil es el plan de ejemplo, sin marcas en el tablero', () => {
    expect(aplicarPlantilla(PLANTILLAS.dificil, PLAN_EJEMPLO.jugadores)).toEqual(PLAN_EJEMPLO);
  });

  it('la de Normal destapa el tablero entero y sale bien con la segura en cualquier casilla', () => {
    const plan = aplicarPlantilla(PLANTILLAS.normal, []);
    expect(plan.jugadores.map((j) => j.nombre)).toEqual(['T1', 'D1', 'D2', 'D3', 'H1', 'T2', 'D4', 'D5', 'D6', 'H2']);
    expect(plan.marcas).toHaveLength(4);
    for (const p of ['prueba1', 'prueba2'] as const) {
      expect(cobertura(PRESETS[p], plan).huecos).toEqual([]);
      expect(probarTodas(PRESETS[p], plan)).toMatchObject({ exitos: 36, total: 36 });
    }
  });

  it('coloca a tanques y sanadores en su hueco por su clase y al resto por orden', () => {
    const js: JugadorPlan[] = [
      { id: 'j1', nombre: 'Cle1', clase: 'cleric', ruta: [] },
      { id: 'j2', nombre: 'Asa', clase: 'assassin', ruta: [] },
      { id: 'j3', nombre: 'Tem', clase: 'templar', ruta: [] },
      { id: 'j4', nombre: 'Can', clase: 'chanter', ruta: [] },
      { id: 'j5', nombre: 'Sin', ruta: [] },
      { id: 'j6', nombre: 'Gla', clase: 'gladiator', ruta: [] },
      { id: 'j7', nombre: 'Cle2', clase: 'cleric', ruta: [] },
    ];
    const plan = aplicarPlantilla(PLANTILLAS.normal, js);
    const hueco = (nombre: string) => {
      const j = plan.jugadores.find((x) => x.nombre === nombre)!;
      return PLANTILLAS.normal.huecos.find((h) => JSON.stringify(h.ruta) === JSON.stringify(j.ruta))?.nombre ?? null;
    };
    // Los dos Clérigos antes que el Cantor; Templario antes que Gladiador; el Cantor y el resto, a los huecos de DPS
    expect([hueco('Tem'), hueco('Gla'), hueco('Cle1'), hueco('Cle2')]).toEqual(['T1', 'T2', 'H1', 'H2']);
    expect([hueco('Asa'), hueco('Sin'), hueco('Can')]).toEqual(['D1', 'D2', 'D3']);
    // La lista conserva su orden y los huecos que faltan entran al final con su nombre
    expect(plan.jugadores.slice(0, 7).map((j) => j.nombre)).toEqual(js.map((j) => j.nombre));
    expect(plan.jugadores.slice(7).map((j) => j.nombre)).toEqual(['D4', 'D5', 'D6']);
  });

  it('con más de 10 jugadores, los que sobran se quedan sin colocar; los nombres de hueco cambian al del nuevo', () => {
    const plan = aplicarPlantilla(PLANTILLAS.normal, nombres(11));
    expect(plan.jugadores).toHaveLength(11);
    expect(plan.jugadores[10].ruta).toEqual([]);
    const deEjemplo = aplicarPlantilla(PLANTILLAS.normal, PLAN_EJEMPLO.jugadores);
    expect(deEjemplo.jugadores.map((j) => j.nombre)).toEqual(['T1', 'D1', 'D2', 'D3', 'H1', 'T2', 'D4', 'D5', 'D6', 'H2']);
  });

  it('las marcas viajan en el enlace', () => {
    const plan = aplicarPlantilla(PLANTILLAS.normal, []);
    const r = leerEnlace(codificarPlan(plan, ajustesDe('prueba1')))!;
    expect(r.plan.marcas).toEqual(PLANTILLAS.normal.marcas);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const ok = { v: 1, p: 'prueba1', j: [['A', '', 'A1']] };
    expect(leerEnlace(b64({ ...ok, m: 'B4 C4' }))?.plan.marcas).toEqual([{ f: 3, k: 1 }, { f: 3, k: 2 }]);
    for (const m of ['A1 A2 A3 A4 A5', 'G1', 'A1p', 3]) expect(leerEnlace(b64({ ...ok, m }))).toBeNull();
  });
});
