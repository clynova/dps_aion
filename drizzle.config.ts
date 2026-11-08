// Migraciones de Postgres. Usa la conexión SIN pooling (DATABASE_URL_UNPOOLED): las migraciones no deben ir por PgBouncer.
//   npm run db:generar   → crea el SQL de la migración en drizzle/ a partir de lib/db/schema
//   npm run db:migrar    → la aplica (en Vercel se ejecuta en el build de cada preview: npm run build:vercel)
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '' },
  strict: true,
  verbose: true,
});
