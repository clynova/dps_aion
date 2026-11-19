import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { binarizar, buscarConocido, engrosar, extraerJugadores, normalizar, PASADAS, preseleccion, type Conocido } from '@/lib/simulador/captura';

// Texto real de tesseract.js (las 3 PASADAS) sobre dos capturas de una party de 10 (18/11/2026), con los nombres
// cambiados: la ventana de party del juego (dos columnas de 5, «nombre[SRV]» o solo «nombre» si es del mismo servidor)
// y la de Questlog («nombre SRV», GS, PC y «Listo»). Errores reales del OCR: corchete leído como «l», AZP como AZF o
// A7F, letras separadas («Sir Mesa», «rum baa»), «xT2» como «XTZ» o «XL».
const ocr = JSON.parse(readFileSync('tests/fixtures/ocr-party-anonimo.json', 'utf8')) as { juego: string[]; questlog: string[] };
const party = ['ventura', 'Kel', 'Pradera', 'rumbaa', 'xT2', 'SirMesa', 'Lorcan', 'Edmund', 'QRZ', 'Dunnie'];
const conocidos: Conocido[] = [...party, 'Otro', 'Praderas'].map((nombre, i) => ({ nombre, clase: i % 2 ? 'cleric' : 'templar' }));
const marcados = (textos: string[], cs: Conocido[]) => {
  const r = extraerJugadores(textos, cs), s = preseleccion(r, textos.length);
  return r.filter((_, i) => s[i]).map((c) => c.nombre);
};

describe('jugadores desde la captura de la party', () => {
  it('ventana del juego con jugadores conocidos: los 10, con su clase, y nada más marcado', () => {
    const r = extraerJugadores(ocr.juego, conocidos);
    expect(marcados(ocr.juego, conocidos).sort()).toEqual([...party].sort());
    expect(r.find((c) => c.nombre === 'Kel')).toMatchObject({ conocido: true, clase: 'cleric' });
    expect(r.find((c) => c.nombre === 'xT2')?.conocido).toBe(true);
  });

  it('ventana del juego sin conocidos: los nombres con servidor y los que salen en todas las pasadas', () => {
    const m = marcados(ocr.juego, []);
    for (const n of ['ventura', 'Kel', 'Pradera', 'rumbaa', 'Lorcan', 'Edmund', 'QRZ', 'Dunnie']) expect(m).toContain(n);
    expect(m.length).toBeLessThanOrEqual(10);
    expect(m).not.toContain('Party');
    expect(m).not.toContain('Random');
  });

  it('Questlog con conocidos: 8 de los 9 que salen (xT2 se lee «XL»), sin «Listo» ni el servidor suelto', () => {
    const m = marcados(ocr.questlog, conocidos);
    expect(m.sort()).toEqual(party.filter((n) => n !== 'xT2' && n !== 'ventura').sort());
    const todos = extraerJugadores(ocr.questlog, conocidos).map((c) => c.nombre.toLowerCase());
    expect(todos).not.toContain('azp');
    expect(todos).not.toContain('listo');
  });

  it('una sola pasada con «nombre[SRV]» basta', () => {
    expect(marcados(['Alfa[AZP]   Beta[ISR]\nGammalAZP]'], [])).toEqual(['Alfa', 'Beta', 'Gamma']);
  });
});

describe('comparar nombres leídos', () => {
  it('iguala las letras que el OCR confunde', () => {
    expect(normalizar('Dunnle')).toBe(normalizar('Dunnie'));
    expect(normalizar('B0b')).toBe(normalizar('Bob'));
  });

  it('acepta una letra de diferencia (2 en nombres largos) y en nombres cortos solo si lleva servidor', () => {
    const cs = [{ nombre: 'Pradera', clase: 'a' }, { nombre: 'xT2', clase: 'b' }];
    expect(buscarConocido('Praderal', cs)?.nombre).toBe('Pradera');
    expect(buscarConocido('Prdra', cs)?.nombre).toBe('Pradera');
    expect(buscarConocido('Prdr', cs)).toBeNull();
    expect(buscarConocido('XTZ', cs)).toBeNull();
    expect(buscarConocido('XTZ', cs, true)?.nombre).toBe('xT2');
  });
});

describe('preparar la imagen', () => {
  it('texto claro sobre fondo oscuro queda negro sobre blanco, también sobre una barra de color', () => {
    // 40×10: fondo oscuro, una barra amarilla de la columna 20 a la 39 y dos «letras» blancas, una en cada zona
    const w = 40, h = 10, px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, letra = (x === 5 || x === 30) && y > 2 && y < 8;
      const [r, g, b] = letra ? [240, 240, 240] : x >= 20 ? [180, 150, 60] : [40, 40, 50];
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
    binarizar(px, w, h, 15);
    const v = (x: number, y: number) => px[(y * w + x) * 4];
    expect([v(5, 5), v(30, 5)]).toEqual([0, 0]);
    expect([v(2, 5), v(25, 5), v(35, 1)]).toEqual([255, 255, 255]);
    engrosar(px, w, h);
    expect(v(6, 5)).toBe(0);
  });

  it('las pasadas combinan escalas y modos distintos', () => {
    expect(new Set(PASADAS.map((p) => `${p.escala}-${p.gordo}-${p.psm}`)).size).toBe(PASADAS.length);
  });
});
