import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compararJson } from '@/lib/comparar';

const raid = () => JSON.parse(readFileSync('tests/fixtures/raid-v2-anonima.json', 'utf8'));

describe('comparador (el que decide la paridad: tiene que ver las diferencias)', () => {
  it('iguales', () => expect(compararJson(raid(), raid())).toEqual([]));
  it('detecta un número cambiado en lo más profundo', () => {
    const b = raid(); const j = Object.keys(b.detalle)[0];
    b.detalle[j].habilidades[0].dano += 1;
    expect(compararJson(raid(), b)).toEqual([`.detalle.${j}.habilidades[0].dano : ${raid().detalle[j].habilidades[0].dano} <> ${b.detalle[j].habilidades[0].dano}`]);
  });
  it('detecta claves que faltan o sobran y nulos', () => {
    const b = raid(); delete b.resumen.kill_s; b.meta.nueva = 1; b.intentos[0].rotura_s = 99;
    const d = compararJson(raid(), b);
    expect(d).toContain('.resumen.kill_s : falta en B');
    expect(d).toContain('.meta.nueva : falta en A');
    expect(d.some((x) => x.startsWith('.intentos[0].rotura_s'))).toBe(true);
  });
  it('detecta cambios de orden salvo en las listas sin orden', () => {
    const b = raid(); b.casteos.reverse();
    expect(compararJson(raid(), b).length).toBeGreaterThan(0);
    expect(compararJson(raid(), b, { sinOrden: ['casteos'] })).toEqual([]);
  });
  it('distingue tipos (1 frente a "1") y longitudes', () => {
    const b = raid(); b.casteos[0].habilidad = Number(b.casteos[0].habilidad); b.curva.pop();
    const d = compararJson(raid(), b);
    expect(d.some((x) => x.startsWith('.casteos[0].habilidad'))).toBe(true);
    expect(d).toContain(`.curva : ${raid().curva.length} elementos <> ${raid().curva.length - 1}`);
  });
  it('ignora las rutas pedidas', () => {
    const b = raid(); b.meta.extraido = 'otro';
    expect(compararJson(raid(), b, { ignorar: ['meta.extraido'] })).toEqual([]);
  });
});
