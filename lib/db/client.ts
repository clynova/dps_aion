// Conexión a Postgres (Neon). Pool por WebSocket: admite transacciones, que la ingesta necesita (fase 4).
// DATABASE_URL: con pooling (Vercel la inyecta; en local, la rama «dev» de Neon en .env.local).
import 'server-only';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL (en local: .env.local con la rama dev de Neon)');

const globalParaPool = globalThis as unknown as { __dpsPool?: Pool };
const pool = globalParaPool.__dpsPool ?? new Pool({ connectionString: url });
if (process.env.NODE_ENV !== 'production') globalParaPool.__dpsPool = pool; // evita abrir pools nuevos en cada recarga de next dev

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
