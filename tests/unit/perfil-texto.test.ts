import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { esquemaPerfil } from '@/lib/ingest/perfil';

describe('esquemaPerfil', () => {
  const archivos = ['tests/fixtures/perfil-anonimo.json', 'tests/fixtures/perfil-anonimo.en.json'];

  it('acepta un perfil escrito por Claude (es y en)', () => {
    expect(archivos.length).toBeGreaterThan(0);
    for (const f of archivos) expect(esquemaPerfil.safeParse(JSON.parse(readFileSync(f, 'utf8'))).success, f).toBe(true);
  });

  it('rechaza campos de más, fechas mal escritas y listas que no son de textos', () => {
    const base = { actualizado: '2026-11-08', raids: 3, resumen: 'x', fortalezas: ['a'], mejorar: [], recomendaciones: [] };
    expect(esquemaPerfil.safeParse(base).success).toBe(true);
    expect(esquemaPerfil.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(esquemaPerfil.safeParse({ ...base, actualizado: '8/11/2026' }).success).toBe(false);
    expect(esquemaPerfil.safeParse({ ...base, fortalezas: [{ texto: 'a' }] }).success).toBe(false);
  });
});
