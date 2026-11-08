import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const ruta = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': ruta('./'), 'server-only': ruta('./tests/stubs/server-only.ts') } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integracion/**/*.test.ts'],
    environment: 'node',
    // Las de integración usan la rama dev de Neon (.env.local); en el CI no hay base y se saltan solas.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
