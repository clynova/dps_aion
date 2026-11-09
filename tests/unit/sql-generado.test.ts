import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SQL } from '@/lib/procesado/sql.generado';

const leer = (f: string) => readFileSync(`db/${f}`, 'utf8').replace(/\r\n/g, '\n');

describe('SQL del navegador', () => {
  it('es exactamente el de db/*.sql (si falla: npm run sql)', () => {
    expect(SQL.esquema).toBe(leer('esquema.sql'));
    expect(SQL.cargar).toBe(leer('cargar.sql'));
    expect(SQL.cargarRuns).toBe(leer('cargar-runs.sql'));
    expect(SQL.vistas).toBe(leer('vistas.sql'));
    expect(SQL.raid).toBe(leer('raid.sql'));
    expect(SQL.runs).toBe(leer('runs.sql'));
  });
});
