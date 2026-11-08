// Conexión a Postgres (Neon). Pool por WebSocket: admite transacciones, que la ingesta necesita (fase 4).
// DATABASE_URL: con pooling (Vercel la inyecta; en local, la rama «dev» de Neon en .env.local).
// El pool se crea la primera vez que se usa, no al importar: el build (y el CI, que no tiene base) importa estos
// módulos sin consultar nada, porque las páginas solo tocan la base en cada petición.
import 'server-only';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

type Db = ReturnType<typeof crear>;

function crear() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL (en local: .env.local con la rama dev de Neon)');
  return drizzle({ client: new Pool({ connectionString: url }), schema });
}

const global = globalThis as unknown as { __dpsDb?: Db };

/** La base. Se conecta al primer uso (y en desarrollo se reutiliza entre recargas de next dev). */
export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    global.__dpsDb ??= crear();
    const v = Reflect.get(global.__dpsDb, prop);
    return typeof v === 'function' ? v.bind(global.__dpsDb) : v;
  },
});
