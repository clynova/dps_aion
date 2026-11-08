// Inicio de sesión con Discord (Better Auth 1.7, sesiones en Postgres). Ver docs/adr/0002-autenticacion.md.
// Variables: AUTH_SECRET (Better Auth la lee sola), AUTH_DISCORD_ID, AUTH_DISCORD_SECRET.
// URL de retorno que hay que dar de alta en Discord: <origen>/api/auth/callback/discord
import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';

/** Hosts desde los que se puede iniciar sesión: producción, la preview de la rama y local. */
export const HOSTS_PERMITIDOS = [
  'dpsaion.vercel.app',
  'dpsaion-git-*-clynovas-projects.vercel.app',
  'localhost:3000',
];

export const auth = betterAuth({
  appName: 'DPS Aion',
  baseURL: { allowedHosts: HOSTS_PERMITIDOS, fallback: 'https://dpsaion.vercel.app' },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  socialProviders: {
    discord: {
      clientId: process.env.AUTH_DISCORD_ID ?? '',
      clientSecret: process.env.AUTH_DISCORD_SECRET ?? '',
      // Nombre visible: el global de Discord (o el de usuario si no tiene) y su avatar
      mapProfileToUser: (p) => ({ name: p.global_name || p.username }),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 días
    updateAge: 60 * 60 * 24,      // se renueva una vez al día si se usa
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [nextCookies()], // siempre el último: deja las cookies puestas desde Server Actions
});
