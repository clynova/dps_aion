# ADR 0002 · Inicio de sesión con Better Auth (y no Auth.js)

Fecha: 8 de noviembre de 2026 · Estado: aceptada (fase 3)

## Contexto

El plan proponía Auth.js (NextAuth) con Discord y sesiones en la base. Al empezar la fase 3:

- El README de Auth.js dice que **Auth.js forma parte de Better Auth** y que se recomienda **empezar los proyectos nuevos con Better Auth**, salvo que se necesiten sesiones sin base de datos (no es nuestro caso).
- next-auth 5 seguía en beta (`5.0.0-beta.32`, julio de 2026). Better Auth va por la **1.7.18 estable**, admite Next 16 y React 19 y trae adaptador para Drizzle.

## Decisión

- **Better Auth 1.7** con el proveedor **Discord** (`identify` y `email`) y **sesiones en Postgres**: tablas `user`, `session`, `account` y `verification` (`lib/db/schema/auth.ts`), con la estructura estándar de Better Auth.
- La **URL de retorno es la misma** que habría usado Auth.js: `<origen>/api/auth/callback/discord`. No hubo que cambiar nada en Discord.
- **URL base dinámica** con una lista de hosts permitidos (`lib/auth/index.ts`): `dpsaion.vercel.app`, `dpsaion-git-*-clynovas-projects.vercel.app` y `localhost:3000`. Discord solo acepta URL de retorno exactas, así que en las previews solo funciona el alias de la rama (`dpsaion-git-<rama>-clynovas-projects.vercel.app`), no la URL de cada despliegue.
- Variables: `AUTH_SECRET` (Better Auth la lee sola), `AUTH_DISCORD_ID` y `AUTH_DISCORD_SECRET`.
- **Grupos propios, sin el plugin `organization` de Better Auth.** Nuestras invitaciones son por enlace (sin email), los roles son los nuestros (propietario, admin, publicador, miembro) y la visibilidad de las raids depende de ellos. Con tablas propias (`grupos`, `miembros` e `invitaciones`) toda la lógica de permisos queda en `lib/permisos.ts` y se puede probar sin depender del modelo del plugin.
- **Sesión en el servidor:** `lib/auth/sesion.ts` (`usuarioActual`) llama a `connection()` antes de leer. Con `cacheComponents`, si no, Next intenta prerenderizar y el pool de Neon (que usa `crypto.randomBytes`) rompe el render. Quien la usa va dentro de `<Suspense>`.

## Consecuencias

- Una dependencia estable en vez de una beta, mantenida por el mismo equipo que absorbió Auth.js.
- El plan menciona Auth.js en varios sitios; donde dice Auth.js, léase Better Auth.
- La tabla de usuarios se llama `user` (la de Better Auth), no `usuarios` como decía el plan.
