# Plan de refactorización: DPS Aion a Next.js, dinámica y multigrupo

> Estado: **propuesta para revisar** · Versión 2, del 8 de noviembre de 2026 · Rama de trabajo propuesta: `refactor/next`
>
> Alcance decidido: la web pasa a ser **para varios grupos**. Cada grupo sube sus propios registros de Questlog, tiene sus miembros y decide qué es público. El grupo de Cry es el primero y conserva todo lo que hay hoy.
>
> Las cifras del «punto de partida» salen del repositorio tal y como está (commit `8f2a8c9`).

---

## 1. Resumen

**Problema.** Hoy cada raid y cada jugador es una carpeta con archivos: una copia de la página (`index.html`), sus datos (`data.json`) y los textos de Claude. Los perfiles se recalculan en el PC (`tools/perfiles.ps1`) y se suben con git. **62 de los 91 archivos versionados** están en `raids/` y `jugadores/`, y cada raid nueva añade o modifica 15–20 más. Además, solo puede publicar quien tiene el pipeline de PowerShell, DuckDB y acceso de escritura al repositorio, es decir, una persona.

**Propuesta.** Una aplicación **Next.js (App Router, TypeScript)** en el mismo proyecto de Vercel, con:

- **Páginas dinámicas**: una por tipo (grupo, raid, jugador), que leen de **Postgres (Neon)**. No hay archivos por entidad.
- **Cuentas con Discord**, **grupos** con miembros y roles, e invitaciones por enlace.
- **Subida desde el navegador**: el miembro de un grupo elige su carpeta de Questlog y **DuckDB-WASM ejecuta en su navegador los mismos `cargar.sql` y `raid.sql`** que usamos hoy. Al servidor solo llega el resultado (unos 50 KB por raid), validado. Nadie tiene que instalar nada.
- **El pipeline de PowerShell sigue sirviendo** para nuestro grupo: publica con la misma API usando un token.
- **Perfiles, medias de grupo y de clase, causas de muerte y buscador** pasan a ser consultas con caché.
- **Privacidad por grupo y por raid**: privada (solo miembros), por enlace o pública.

**Lo que no cambia.**
- Las cifras se siguen calculando con `db/raid.sql`, ya validado contra los datos. El navegador ejecuta el mismo SQL.
- La web sigue siendo bilingüe (es/en), con el mismo diseño. Las URL actuales siguen funcionando por redirección.
- Nuestro flujo «analiza la última raid» con Claude se mantiene. Cambia solo el destino del texto, que va a la base por la API.

**Antes y después.**

| | Hoy | Después |
|---|---|---|
| Quién puede publicar | Una persona con el pipeline y acceso al repo | Cualquier miembro con permiso de un grupo, desde el navegador |
| Publicar una raid | El `.bat` extrae, hace commit de 15–20 archivos y push, y se reconstruye toda la web | Subida en el navegador o con el `.bat`: 1 llamada a la API; solo se refrescan las páginas afectadas |
| Archivos por raid y por jugador | 3–5 por raid, 2–4 por jugador | 0 (filas en la base) |
| Cambiar el diseño del perfil | Editar la plantilla, regenerar todas las copias y subir | Editar 1 componente |
| Raids privadas | Carpeta `_privado/` en un PC | `visibilidad` por raid y por grupo, con control de acceso |
| Copia de seguridad de los datos brutos | Solo en el PC (se perdió al formatear) | Opcional en Vercel Blob, por grupo |

---

## 2. Punto de partida (inventario)

| Pieza | Archivos | Qué hace |
|---|---|---|
| Portada | `index.html`, `assets/home.js` (110 líneas) | Lista de raids, evolución por jefe, top 5 jugadores, buscador y botón «solicitar análisis» |
| Página de raid | `assets/raid-shell.html` (151) copiado en cada `raids/<slug>/index.html`, `assets/raid.js` (412) | Gráficas D3, ficha del jugador, análisis |
| Perfil | `assets/jugador-shell.html` (164) copiado en cada `jugadores/<slug>/index.html`, `assets/jugador.js` (365) | Perfil automático y de Claude, 6 pestañas |
| Textos | `assets/i18n.js` (357) | Diccionario es/en y selector ES/EN (`?lang=`, `localStorage`) |
| Estilos | `assets/site.css` (181) | Tokens, modo oscuro, componentes `rx-*` |
| Función | `api/solicitar.js` (40) | Aviso a Discord (`DISCORD_WEBHOOK_URL`); anti-repetición en memoria, por instancia |
| Datos | `raids/*/data.json` (24–52 KB), `jugadores/*/data.json`, índices | Generados en el PC |
| Nombres | `nombres.json`, `nombres.en.json` (32 KB) | Habilidades, NPC, iconos y apodos |
| Pipeline local | `tools/*.ps1`, `db/*.sql` (`cargar.sql` 155 líneas, `raid.sql` 267), `nueva-raid.bat` | Questlog → DuckDB → `data.json` → git |

**Volúmenes medidos.**
- Una raid (la del 7/11 19:06) tiene 17 intentos, 159 puntos de curva, 412 casteos del jefe, 85 filas de DPS por intento y 20 causas de muerte. Con los desgloses de apoyo, supervivencia y rotación son del orden de **1.000–3.000 filas y menos de 1 MB**.
- Los archivos de Questlog pesan unos **66 KB por encuentro comprimido**. Una noche de raid son 1–2 MB, y la carpeta completa de Questlog (hasta 500 encuentros) unos 30 MB.
- La base DuckDB local pesa unos **450 KB por encuentro** (20 MB para 44). Por eso los eventos brutos no deben ir a Postgres.
- Todo el procesado de Questlog es **SQL sobre JSON** (`cargar.sql`, `cargar-runs.sql`, `raid.sql`). No hay lógica en PowerShell más allá de copiar archivos e invocar DuckDB. Esto es lo que hace viable ejecutarlo en el navegador.

---

## 3. Arquitectura objetivo

```
 Navegador de un miembro                           Vercel
┌───────────────────────────────────┐      ┌──────────────────────────────────────────┐
│ /g/<grupo>/subir                  │      │ Next.js (App Router)                     │
│  1. elige carpeta de Questlog     │      │                                          │
│  2. lista runs (runs/*.json)      │      │  Páginas (Server Components + caché)     │
│  3. DuckDB-WASM: esquema +        │      │   /  /g/[grupo]  /g/[grupo]/raids/[slug] │
│     cargar.sql + raid.sql         │ JSON │   /jugadores/[slug]   (+ /en/...)        │
│  4. vista previa y visibilidad    │ ────▶│                                          │
│  5. envía (+ .gz si el grupo      │      │  Better Auth (Discord) · roles por grupo│
│     guarda copia)                 │      │  API /api/v1/* → Zod → transacción       │
└───────────────────────────────────┘      │        │            revalidateTag()      │
 PC de Cry: .bat → publicar.ps1 ──token──▶ │        ▼                                 │
 Claude: análisis/perfiles ──────token──▶  │  Postgres (Neon)        Vercel Blob      │
                                           │  datos agregados,       .gz brutos       │
                                           │  usuarios, grupos       (opcional)       │
                                           │  Cron: nombres de questlog.gg            │
                                           │  /api/solicitar → Discord del grupo      │
                                           └──────────────────────────────────────────┘
```

### 3.1 Decisiones técnicas

| Tema | Recomendación | Por qué | Alternativas descartadas |
|---|---|---|---|
| Framework | **Next.js, App Router, TypeScript**, versión estable más reciente fijada exacta | Vercel lo despliega sin configuración; Server Components sirven HTML con datos y D3 queda solo para las gráficas | Astro (peor para la parte de app: login, subida, paneles); SPA pura (peor primera carga) |
| Base de datos | **Postgres en Neon** (Marketplace de Vercel) | Relacional, apta para agregar perfiles con SQL; ramas de base por preview; escala a planes de pago sin migrar | Supabase (válido; su auth no aporta nada frente a Better Auth con Discord); MotherDuck (menos estándar para servir una web) |
| ORM / migraciones | **Drizzle ORM + drizzle-kit** con el driver serverless de Neon | Tipado de punta a punta, SQL legible, migraciones en el repo | Prisma (más pesado en serverless) |
| Login | **Better Auth con proveedor Discord**, sesiones en base (adaptador Drizzle). Ver [ADR 0002](adr/0002-autenticacion.md) | La comunidad ya vive en Discord y así no hay contraseñas que guardar | Cuentas con email y contraseña; Clerk (de pago al crecer) |
| Dónde se calculan las cifras | **En el cliente, con el `raid.sql` de siempre**: DuckDB-WASM en el navegador o DuckDB en el PC de Cry. El servidor valida y guarda | Un solo SQL, ya contrastado; no hay que reescribirlo en TypeScript ni pagar cómputo en el servidor | Reescribir en Postgres (duplicar lógica); procesar en una función de Vercel (límites de tiempo y tamaño; queda como plan B, apartado 8) |
| Eventos brutos | **No van a Postgres.** Copia opcional de los `.gz` en **Vercel Blob**, privada y por grupo | Unos 450 KB por encuentro en tablas frente a 66 KB comprimido; permite recalcular raids antiguas cuando mejore `raid.sql` | Solo en los PC de cada uno (ya se perdió una vez) |
| Idiomas | **Rutas nativas de Next** (`app/[lang]` + `proxy.ts`) y diccionario plano propio: español sin prefijo y `/en/...`; `?lang=en` redirige. Ver [ADR 0001](adr/0001-idiomas.md) | URL limpias e indexables; las actuales siguen valiendo; las claves actuales (con puntos solapados) se conservan | next-intl (anida por puntos y obliga a renombrar claves); traducir en el cliente (parpadeo, peor SEO) |
| Gráficas | **D3 v7 en componentes cliente**, portando las funciones actuales | Ya funcionan y están verificadas | Recharts o Chart.js (rehacer cada gráfica) |
| Estilos | **`site.css` global + CSS Modules** | Mismo diseño, nada que reaprender | Tailwind (reescribir sin ganar nada ahora) |
| Caché | Etiquetas por entidad (`raid:<id>`, `jugador:<id>`, `grupo:<id>`, `portada`, `nombres`) que la ingesta invalida | Las páginas cambian solo al llegar datos | Render en cada visita |
| Pruebas | **Vitest**, **Playwright** y **test de paridad** contra los `data.json` actuales | Regla de la casa: comprobar cada cifra | Solo pruebas manuales |

### 3.2 Grupos, roles y privacidad

**Roles por grupo**

| Rol | Puede |
|---|---|
| `propietario` | Todo lo de admin, más borrar el grupo y transferirlo |
| `admin` | Invitar y expulsar, cambiar roles (salvo el de propietario), cambiar la visibilidad, borrar raids, editar apodos y el webhook de Discord del grupo |
| `publicador` | Subir raids y cambiar la visibilidad de las suyas |
| `miembro` | Ver las raids privadas del grupo |

**Visibilidad**
- Cada **raid** puede ser `privada` (solo miembros), `enlace` (quien tenga la URL; no se lista) o `publica`. El valor por defecto lo fija el grupo, y para un grupo nuevo es `privada`.
- Cada **grupo** puede ser público (aparece en la portada y en el buscador) u oculto.
- **Perfil de jugador global** (`/jugadores/<slug>`): reúne solo las raids que quien lo ve tiene permiso para ver. Un visitante anónimo ve solo las públicas; un miembro ve también las privadas de sus grupos. Si no queda ninguna raid visible, el resultado es 404.

**Identidad de los jugadores.** Un jugador es `(nombre, servidor)`; Questlog da el servidor de cada uno. El slug es el nombre, o `nombre-servidor` si hay homónimos. Un usuario de Discord puede **reclamar** su personaje más adelante (fase 11), lo que le daría control sobre su perfil, como ocultarlo o pedir análisis.

**Jugadores de fuera del grupo.** Siguen apareciendo en las raids, como hoy. Al subir, el asistente muestra quién aparece y recuerda la regla actual de preguntar antes de publicar a gente de fuera. Se añade **«ocultar mi nombre»**: un jugador puede pedir que su nombre salga como «Jugador» en las raids de grupos a los que no pertenece.

### 3.3 Modelo de datos (Postgres)

```sql
-- Cuentas (Better Auth, adaptador Drizzle): user, session, account, verification
usuarios          (id, discord_id UNIQUE, nombre, avatar, creado)

grupos            (id, slug UNIQUE, nombre, descripcion, visible bool,
                   visibilidad_defecto ('privada'|'enlace'|'publica'),
                   guardar_brutos bool, discord_webhook_cifrado NULL, creado, creado_por)
miembros          (grupo_id, usuario_id, rol ('propietario'|'admin'|'publicador'|'miembro'),
                   desde, PK (grupo_id, usuario_id))
invitaciones      (codigo UNIQUE, grupo_id, rol, caduca, usos_max, usos, creada_por)
tokens_api        (id, grupo_id, nombre, hash, ultimo_uso, creado, revocado)  -- para publicar.ps1

jugadores         (id, nombre, servidor, slug UNIQUE, clase_id, oculto bool,
                   usuario_id NULL /* reclamado */, UNIQUE (nombre, servidor))

raids             (id, slug, grupo_id, run_id, huella /* para detectar duplicados */,
                   fecha timestamptz, mazmorra, npc_jefe, visibilidad,
                   intentos, matado, kill_s, minutos_combate, mejor_pct, mejor_intento,
                   muertes_grupo, dps_grupo_medio, hp_jefe, run_min, limite_min, reseteos,
                   grabado_por /* personaje */, subido_por → usuarios,
                   origen ('navegador'|'pc'), esquema_version, sql_version, extraido, publicado,
                   UNIQUE (grupo_id, slug))
raid_otros        (raid_id, npc, intentos, matado, kill_s, dps_raid)
intentos          (raid_id, n, duracion_s, progreso_pct, matado, dps_grupo, muertes,
                   rotura_s, ultima_causa, PK (raid_id, n))
curva             (raid_id, intento, t, progreso)
casteos_jefe      (raid_id, intento, t, habilidad)

raid_jugador      (raid_id, jugador_id, en_grupo bool, clase_id, gs, cp, dps, hps, dano_recibido,
                   muertes, crit_pct, espalda_pct,
                   curacion, escudos, absorbido,                                   -- apoyo
                   golpes_recibidos, cura_recibida, escudo_recibido, resurrecciones,
                   bajo30_pct,                                                      -- supervivencia
                   casteos, interrumpidos, vivo_s, casteos_min, pausas_pct,
                   primer_golpe_s,                                                  -- rotación
                   PK (raid_id, jugador_id))
dps_intento       (raid_id, jugador_id, intento, dps, muertes)
muertes           (raid_id, jugador_id, intento, orden, t, habilidad, origen, golpe_max,
                   vida_5s, vida_1s, dano_5s, cura_5s)
desglose          (raid_id, jugador_id, tipo, habilidad, valor, pct, golpes, extra jsonb)
                   -- tipo: 'dano' | 'recibido' | 'cura' | 'escudo' | 'casteo' | 'buff'
reparto_cura      (raid_id, jugador_id, objetivo_id → jugadores, cantidad)
mitigacion        (raid_id, jugador_id, tipo, n, evitado bool)

analisis          (raid_id, idioma, contenido jsonb, autor ('claude'|'auto'|usuario), actualizado,
                   PK (raid_id, idioma))
perfil_texto      (jugador_id, grupo_id NULL, idioma, contenido jsonb, raids, actualizado)

nombres           (tipo ('habilidad'|'npc'), id bigint, idioma, nombre, icono, PK (tipo, id, idioma))
apodos            (tipo, id, idioma, apodo, grupo_id NULL /* NULL = global */)

archivos          (id, grupo_id, raid_id NULL, run_id, encuentro_id, blob_url, bytes, sha256, subido)
solicitudes       (id, jugador_id, grupo_id, usuario_id NULL, creada, avisada bool)
auditoria         (id, grupo_id, usuario_id NULL, accion, ref, detalle jsonb, creada)
```

**Vistas** (sustituyen a `perfiles.ps1` y a los índices):
- `v_raid_jugador_ctx`: cada fila de `raid_jugador` con la media del grupo y de su clase en esa raid (ventanas por `raid_id` y por `raid_id, clase_id`), el puesto en DPS, las muertes por intento y la primera muerte media.
- `v_causas_raid` y `v_causas_jugador`: agrupan `muertes`. Las causas dejan de guardarse.
- El **permiso de lectura** es una sola función SQL o de TypeScript (`raidsVisiblesPara(usuario)`) que usan todas las consultas. Nunca se filtra en el componente.

**Duplicados.** Si dos miembros del mismo grupo graban la misma noche, sus `run_id` son distintos. Se calcula una **huella**: jefe, día, conjunto de jugadores y duraciones de los intentos redondeadas. Al subir una raid cuya huella ya existe en el grupo, se pregunta si **reemplazar** la anterior (por ejemplo, si la nueva grabación es más completa) o **descartar** la nueva.

### 3.4 Contrato de ingesta (formato v2)

Es **el mismo JSON que hoy genera `db/raid.sql`**, con estos cambios: `esquema_version: 2`, `sql_version` (hash de `raid.sql`, para saber con qué versión se calculó), `servidor` en cada jugador, `en_grupo` (para distinguir a la gente de fuera) y la `huella`.

El servidor:
1. Comprueba la sesión y el rol `publicador` (navegador), o un token del grupo (PC o Claude).
2. Valida con **Zod**: tipos, rangos (porcentajes 0–100, tiempos ≥ 0, intentos coherentes con `intentos[]`), tamaño máximo y que cada jugador de `detalle` esté en `jugadores`.
3. En **una transacción**: hace upsert por `(grupo_id, slug)`, borra y reinserta las filas hijas y crea o actualiza los jugadores. Publicar dos veces lo mismo deja el mismo resultado.
4. Llama a `revalidateTag` para la raid, el grupo, la portada y cada participante.
5. Escribe en `auditoria` y responde con la URL y un resumen.

**Confianza.** Los datos los calcula el cliente, así que un usuario podría inventarlos. Las raids no se mezclan entre grupos ni se comparan en rankings globales en esta versión, y si el grupo guarda los `.gz`, el servidor puede recalcular más adelante para verificar. Los **rankings entre grupos** quedan fuera hasta que exista esa verificación.

### 3.5 API

| Método | Ruta | Acceso | Uso |
|---|---|---|---|
| `POST` | `/api/v1/grupos/:grupo/raids` | publicador o token | Publicar o actualizar una raid (v2) |
| `PATCH` · `DELETE` | `/api/v1/grupos/:grupo/raids/:slug` | publicador (las suyas) o admin | Visibilidad, borrar |
| `PUT` | `/api/v1/grupos/:grupo/raids/:slug/analisis/:idioma` | admin o token | Análisis (Claude) |
| `PUT` | `/api/v1/jugadores/:slug/perfil/:idioma` | admin o token del grupo | Perfil escrito por Claude |
| `POST` | `/api/v1/grupos/:grupo/archivos` | publicador | Token temporal para subir `.gz` directamente a Blob |
| `GET` | `/api/v1/grupos/:grupo/raids/:slug` | según visibilidad | La raid en formato `data.json` (Claude, paridad, exportar) |
| `GET` | `/api/v1/jugadores?q=` | según visibilidad | Buscador |
| `POST` | `/api/v1/grupos` · `/api/v1/invitaciones/:codigo` | usuario con sesión | Crear un grupo · unirse |
| `POST` | `/api/solicitar` | público | «Solicitar análisis» → webhook del grupo; anti-repetición en `solicitudes` |
| `GET` | `/api/cron/nombres` | `CRON_SECRET` | Refresco diario de nombres e iconos desde questlog.gg |

### 3.6 Rutas de la web

| Ruta | Página |
|---|---|
| `/` | Portada: qué es la web, grupos públicos, últimas raids públicas y buscador de jugadores; «Entrar con Discord» |
| `/g/[grupo]` | Grupo: lo que hoy es la portada (raids, evolución por jefe, top 5) |
| `/g/[grupo]/raids/[slug]` | Raid (la página actual) |
| `/g/[grupo]/subir` | Asistente de subida (publicadores) |
| `/g/[grupo]/ajustes` | Miembros, invitaciones, visibilidad, webhook, tokens (admins) |
| `/jugadores/[slug]` | Perfil global con las 6 pestañas |
| `/mis-grupos` · `/unirse/[codigo]` | Cuenta |
| `/en/...` | Lo mismo en inglés |

**Compatibilidad.** `/raids/<slug>` redirige a `/g/<grupo de Cry>/raids/<slug>` (redirección permanente, en `next.config`). `/jugadores/<slug>` se mantiene, y `?lang=en` redirige a `/en/...`. Los enlaces ya compartidos en Discord siguen funcionando.

### 3.7 Estructura del repositorio

```
app/
  [locale]/page.tsx
  [locale]/g/[grupo]/(page, raids/[slug], subir, ajustes)/page.tsx
  [locale]/jugadores/[slug]/page.tsx
  [locale]/(cuenta)/mis-grupos, unirse/[codigo]
  api/auth/[...nextauth]/route.ts   api/v1/**/route.ts   api/solicitar   api/cron/nombres
components/
  charts/ (D3, 'use client')   raid/   jugador/   grupo/   subida/   ui/
lib/
  db/ (schema.ts, client.ts, queries/, permisos.ts)
  auth/ (config.ts, roles.ts)
  ingest/ (esquema.ts con Zod, guardar.ts, huella.ts)
  procesado/ (duckdb-wasm: carga de archivos, ejecución de los .sql, worker)
  perfil/insights.ts   formato.ts   nombres.ts
messages/es.json  messages/en.json
db/            SQL compartido: esquema.sql, cargar*.sql, raid.sql (lo usan el PC y el navegador)
drizzle/       migraciones de Postgres
tools/         PowerShell: cargar-db, extraer-raid, publicar.ps1
scripts/       migrar-json.ts, paridad.ts
tests/         unit/  e2e/  fixtures/ (una noche de Questlog anonimizada)
docs/          este plan y las decisiones (adr/)
```

Los `.sql` de `db/` se convierten en **fuente única**. El navegador los importa como texto en el build, y una prueba garantiza que PC y navegador producen el mismo JSON con los mismos archivos de entrada.

---

## 4. Fases

Cada fase termina con una **PR a `refactor/next`**, su preview en Vercel y unos **criterios de hecho**. La web actual sigue en `main`, y `nueva-raid.bat` funciona hasta el corte (fase 9).

### Fase 0 · Preparación
- Rama `refactor/next` y versiones fijadas (Node LTS, Next, React, Better Auth, Drizzle, D3, DuckDB-WASM).
- Vercel: **Neon** desde el Marketplace (`DATABASE_URL`, ramas por preview), almacén **Blob**, `AUTH_SECRET`, `CRON_SECRET`, `DISCORD_WEBHOOK_URL` (ya existe).
- Discord Developer Portal: aplicación OAuth con las URL de callback de producción y de las previews (`AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`).
- `docs/adr/`: una nota por decisión del apartado 3.1.
- **Hecho cuando:** las variables existen en Preview y Production y la rama tiene su preview.

### Fase 1 · Prueba de concepto: procesar en el navegador (primero, porque define la arquitectura)
- Página de prueba que elige una carpeta (`<input webkitdirectory>`; en Chrome y Edge también `showDirectoryPicker`), lee `runs/*.json` y los `encounters/*.json.gz` de una run, los descomprime (`DecompressionStream`) y ejecuta `esquema.sql` + `cargar*.sql` + `vistas.sql` + `raid.sql` en **DuckDB-WASM dentro de un Web Worker**.
- Medir tiempo y memoria con una noche real (unos 20 encuentros, 1–2 MB) en un PC normal y en uno modesto.
- **Hecho cuando:** el JSON del navegador es **idéntico** (con `comparar-json`) al que genera DuckDB en el PC para la misma run, y tarda menos de 30 s. Si no se cumple, se pasa al plan B del apartado 8.
- **Resultado (8/11/2026): superada con mazmorras de 5.** 11 de 11 runs iguales, alrededor de 1 s por run y 107 MB con 41 encuentros. Falta repetirla con la primera raid real. Detalle y cambios que implica en [`fase1-procesar-en-navegador.md`](fase1-procesar-en-navegador.md).

### Fase 2 · Esqueleto de la aplicación
- `create-next-app` (TypeScript, App Router, ESLint), idiomas con `app/[lang]` y `proxy.ts` (es sin prefijo, `/en`), layout con ES | EN y `site.css` global.
- Proxy de idioma (en Next 16 el middleware se llama `proxy.ts`). Las redirecciones de `/raids/<slug>` (apartado 3.6) se hacen en la fase 5, cuando exista el grupo en la base.
- CI en GitHub Actions: `typecheck`, `lint`, `test` y `build` en cada PR.
- **Hecho cuando:** la preview muestra una portada vacía en es/en con el diseño actual y el CI pasa.
- **Resultado (8/11/2026):** Next.js 16.4.5 y React 19.3 (con `cacheComponents`), Node 26 en local y 24 en el CI y en Vercel. 14 pruebas de idioma. En local: build correcto, `/es` y `/en` prerenderizadas y redirecciones comprobadas. Se trabaja en un worktree **fuera de OneDrive** (`C:\Users\jahnn\dev\dps_aion-next`), para que `node_modules` no se sincronice y para que la carpeta de OneDrive siga en `main` con `nueva-raid.bat`.

### Fase 3 · Base de datos y cuentas
- `lib/db/schema/` (apartado 3.3) y migración inicial. Las vistas (`v_raid_jugador_ctx`, causas) pasan a la fase 4, donde hay datos para probarlas.
- Better Auth con Discord y sesiones en la base ([ADR 0002](adr/0002-autenticacion.md)). Permisos en `lib/permisos.ts` (puros) y `lib/db/grupos.ts` (`rolEn`, `grupoParaVer`).
- Crear grupo, invitaciones por enlace, roles y página de ajustes mínima.
- **Hecho cuando:** en la preview se puede entrar con Discord, crear un grupo, invitar a otra cuenta y ver que cada rol puede lo que dice la tabla del apartado 3.2 y nada más (con pruebas automáticas de permisos).
- **Resultado (8/11/2026):** esquema completo (27 tablas: 4 de cuentas, 4 de grupos y 19 de raids, textos y operación) en la rama `dev` de Neon. Login con Discord, crear grupo, invitaciones por enlace (con caducidad y usos), roles, expulsar o salir y ajustes. Hay 19 pruebas de permisos (matriz completa rol × acción, raids, roles e invitaciones) y 9 de integración contra la base, que crean y borran sus propios datos. **Falta la prueba con una cuenta real de Discord**, que tiene que hacer el usuario. Configuración de la fase 0: Neon quedó conectado a Preview y Production (no a Development), con variables *Sensitive* que no se pueden descargar; en local se usa una rama `dev` de Neon pegada en `.env.local`. Las migraciones se aplican en el build de Vercel (`npm run build:vercel`).

### Fase 4 · Ingesta y migración de lo existente
- `lib/ingest` (Zod para v2, que también acepta el v1 actual) y escritura en transacción; `huella.ts` para duplicados.
- Rutas `/api/v1/...` de publicación con sesión o token.
- `scripts/migrar-json.ts`: crea el grupo de Cry (Cry como propietario cuando entre con Discord) y lo importa todo: 5 raids, análisis es/en, 10 perfiles de Claude, nombres y apodos.
- `scripts/paridad.ts`: `GET /api/v1/.../raids/:slug` frente a cada `data.json` original y los perfiles calculados frente a `jugadores/*/data.json`, con las reglas de `comparar-json.ps1`.
- **Hecho cuando:** la paridad da **0 diferencias** en las 5 raids y los 10 perfiles, y publicar dos veces no cambia nada.
- **Resultado (8/11/2026): paridad completa, 0 diferencias**: 5 raids, 10 análisis, 20 perfiles escritos por Claude, 10 perfiles calculados (port de `perfiles.ps1` en `lib/perfil/construir.ts`, con el redondeo al par de .NET) y el índice de jugadores. Migrar dos veces no cambia nada. API `/api/v1/grupos/:grupo/raids` (POST, GET, PATCH, DELETE y PUT del análisis) con sesión o token, probada de punta a punta (401, 403, 404, 409, 422 y reemplazo de duplicados). **Diferencias con lo previsto:** (1) las vistas SQL no hicieron falta, porque el perfil se calcula en TypeScript sobre las raids reconstruidas; si un día pesa, se pasa a SQL con la misma paridad como prueba. (2) En las causas de los perfiles (top 8), `perfiles.ps1` desempataba según el orden interno de una tabla hash; ahora se desempata por golpe máximo e id, y la paridad exige las mismas muertes por puesto y cifras correctas. (3) Se guarda `meta` completo en JSON para conservar la fecha con su zona horaria.

### Fase 5 · Páginas de lectura
Orden: **raid → perfil → grupo → portada**. Server Components con caché y etiquetas; componentes cliente solo para gráficas, pestañas, ficha y buscador.
- La raid y el perfil iguales a los actuales, incluidas las 6 pestañas y la ficha con `#Jugador`.
- La portada del grupo es la portada actual; la portada global es nueva (apartado 3.6).
- `generateMetadata` por página e imagen para compartir en Discord con `next/og`.
- **Hecho cuando:** Playwright recorre las 5 raids y los 10 perfiles en es/en, en escritorio y en móvil (375 px), sin errores de consola. Las cifras visibles (tiles y tablas) coinciden con las de la web actual en una comparación automática, y un visitante anónimo no ve nada privado.
- **Resultado (8/11/2026): las 32 páginas iguales a la web actual** (5 raids con ficha, 10 perfiles con sus 6 pestañas y la página del grupo, en es/en), comparadas zona por zona con `npm run comparar-paginas` (Playwright). Móvil (375 px) sin desbordes, sin errores de consola y raid privada invisible sin sesión. Port por adaptador: plantillas en JSX y el código de dibujo original en `lib/legado` ([ADR 0003](adr/0003-port-de-paginas.md)). Las URL antiguas `/raids/<slug>` redirigen con 308. Portada global con la lista de grupos. **Pendiente:** el botón «solicitar análisis» del buscador (fase 8), `next/og` para las imágenes al compartir y la caché por etiquetas (ver el ADR).

### Fase 6 · Subida desde el navegador
Asistente en `/g/[grupo]/subir`, con el procesado de la fase 1 convertido en producto:
1. **Carpeta**: explica dónde está (`%APPDATA%\Questlog\aion-2`, con pasos para llegar a una carpeta oculta) y recuerda la última elección si el navegador lo permite.
2. **Runs**: lista las recientes con fecha, mazmorra, jefe y número de jugadores; las de 8 o más salen marcadas como raid y las que ya están subidas aparecen indicadas.
3. **Procesado** en el Worker, con progreso.
4. **Vista previa**: resumen, jugadores (los de fuera del grupo resaltados, con el recordatorio de privacidad), visibilidad y aviso si hay un duplicado.
5. **Envío** del JSON y, si el grupo lo tiene activado, de los `.gz` a Blob con subida directa.
- **Hecho cuando:** una persona sin nada instalado sube una noche real desde Chrome, Edge y Firefox, el resultado coincide con el del PC, y los errores (carpeta equivocada, run sin intentos, sesión caducada) muestran mensajes claros en es/en.
- **Resultado (8/11/2026):** asistente en `/g/<grupo>/subir` (publicador o más). `scripts/probar-subida.mts` (Playwright) lo recorre de punta a punta con la carpeta real de Questlog: elige la carpeta, calcula la run en el navegador (alrededor de 1 s), la sube, la vuelve a subir (se actualiza sin duplicar) y lo guardado sale **igual a lo que calcula DuckDB nativo en el PC** (0 diferencias, 2 runs). Cambios: `db/runs.sql` comparte la regla del jefe principal; el SQL del navegador se genera desde `db/*.sql` (`npm run sql`, con una prueba que vigila que no se desfasen) y viaja su huella (`sql_version`); `raid.sql` exporta el `servidor` de cada jugador, y un jugador migrado sin servidor lo recibe en su primera raid nueva en vez de duplicarse. **Pendiente:** Firefox (el de Playwright no arranca en este equipo; probar a mano), subir los `.gz` brutos a Blob (sin Blob configurado aún) y servir DuckDB-WASM desde nuestro dominio en vez de jsDelivr.

### Fase 7 · Pipeline del PC (nuestro grupo)
- `tools/publicar.ps1`: envía el JSON de `raid.sql` con un **token del grupo** (creado en ajustes y guardado en un archivo local fuera de git o en una variable de entorno). Sube los `.gz` si el grupo los guarda y publica análisis y perfiles con `-Analisis` / `-Perfil`. Va en UTF-8 con BOM y envía el cuerpo como bytes UTF-8.
- `extraer-raid.ps1` escribe en una carpeta temporal y deja de llamar a `perfiles.ps1`; `nueva-raid.bat` pasa a extraer y publicar, sin git.
- **Hecho cuando:** una raid llega a la preview pulsando el `.bat`, sin ningún commit.

### Fase 8 · Nombres, solicitudes, cron y flujo de Claude
- `GET /api/cron/nombres` (diario): descarga habilidades y NPC de questlog.gg (UTF-8 decodificado a mano, como hoy) para los ids que existen en la base. Las zonas `N_Invisible_Summon_*` siguen saliendo como «Zona 8-2». Los apodos pueden ser globales (los 28 actuales de Rahu) o de un grupo.
- `/api/solicitar` lee de la base y avisa al **webhook del grupo** (cifrado en la base). La espera de 10 minutos pasa a guardarse en `solicitudes`.
- `CLAUDE.md`: «analiza la última raid» lee por la API (o la DuckDB local para ir más a fondo) y publica con `publicar.ps1`. Las reglas de siempre se mantienen.
- **Hecho cuando:** el cron se ejecuta en la preview, una solicitud llega al Discord del grupo y un análisis publicado por Claude se ve en es/en sin desplegar.

### Fase 9 · Corte
1. Avisar y congelar `nueva-raid.bat` en `main` (mejor un día sin raid). Volver a ejecutar `migrar-json.ts` y `paridad.ts` contra producción.
2. Merge de `refactor/next` a `main`: misma URL y mismo proyecto de Vercel.
3. Comprobar en vivo las 5 raids y los 10 perfiles, las redirecciones antiguas, `?lang=en`, el login, una subida desde el navegador, una desde el `.bat` y una solicitud.
4. Borrar del repo `raids/`, `jugadores/`, `nombres*.json`, `assets/*-shell.html` y `tools/perfiles.ps1`. Se pueden recuperar del historial de git.
5. **Vuelta atrás:** «Instant Rollback» de Vercel. La base no se toca y los JSON siguen en el historial.
- **Hecho cuando:** producción sirve todo desde la base y el repo no tiene archivos por raid ni por jugador.

### Fase 10 · Abrir a otros grupos
- Página de inicio que explique la web, guía «cómo subir tu primera raid» (es/en) y términos y privacidad: qué se guarda, quién lo ve, cómo borrar un grupo y cómo pedir «ocultar mi nombre».
- Límites de uso por grupo (raids al mes, tamaño de los brutos) y panel interno de uso.
- **Hecho cuando:** un grupo de prueba ajeno crea su grupo, sube una raid y la comparte por enlace sin ayuda.

### Fase 11 · Después (fuera de este plan, preparado por el diseño)
- **Reclamar personaje** (vincular la cuenta de Discord con `(nombre, servidor)`), con verificación.
- **Recalcular desde los `.gz`** cuando cambie `raid.sql`, para que las mejoras lleguen a raids antiguas y para verificar datos en el servidor.
- **Rankings entre grupos**, solo con datos verificados.
- **Análisis automático** para grupos que no tengan a alguien que lo pida a Claude a mano. Habría que decidir proveedor, modelo y coste.

---

## 5. Pruebas y calidad

| Nivel | Qué | Herramienta | Cuándo |
|---|---|---|---|
| Tipos y estilo | Todo el código | `tsc --noEmit`, ESLint | Cada PR |
| Unitarias | Esquema de ingesta (v1, v2, inválidos), huella, perfil automático, formato es/en, sustitución de ids | Vitest | Cada PR |
| Permisos | Matriz rol × acción × visibilidad: ningún anónimo ni miembro de otro grupo ve o modifica lo que no debe | Vitest contra una rama de Neon | Cada PR |
| SQL compartido | Mismo JSON con DuckDB nativo y con DuckDB-WASM para el fixture | Vitest y Node | Cada PR que toque `db/*.sql` |
| Paridad | La API reconstruye cada `data.json` y perfil actual | `scripts/paridad.ts` | Fases 4, 5 y 9 |
| Extremo a extremo | Lectura (es/en, móvil), login, crear grupo, invitar, subir desde el navegador | Playwright contra la preview | Cada PR desde la fase 5 |
| En vivo | Las mismas comprobaciones en producción | Navegador | Fase 9 |

El **fixture** es una noche real de Questlog con los nombres de los jugadores anonimizados, guardada en `tests/fixtures/`. No se suben datos de jugadores ajenos al repositorio.

---

## 6. Seguridad y privacidad

- **Secretos** solo en Vercel o en archivos locales fuera de git. Los tokens de grupo y los webhooks se guardan **cifrados** (los tokens, solo como hash) y se pueden revocar.
- **Autorización en el servidor** en cada consulta y ruta, mediante `permisos.ts`. Hay pruebas de la matriz completa (apartado 5).
- **Validación estricta** (Zod) y límites de tamaño. Los textos se muestran siempre como texto; no se usa `dangerouslySetInnerHTML`.
- **CSRF y sesiones**: lo que trae Better Auth por defecto, cookies `httpOnly` y `SameSite`.
- **Privacidad**: los grupos nuevos son privados por defecto. Los brutos de Blob (que incluyen a jugadores ajenos) son privados y solo los lee el servidor. Existe «ocultar mi nombre», y el borrado de un grupo elimina sus raids, textos y brutos.
- **Abuso**: límites por usuario y grupo en la subida, el buscador y las solicitudes; registro en `auditoria`.

---

## 7. Costes y límites

| Servicio | Situación inicial | Cuándo revisar |
|---|---|---|
| Vercel | Hobby (uso **no comercial**) | Si la web tuviera ingresos (donaciones con contrapartida, anuncios) habría que pasar a Pro |
| Neon | Gratuito: 0,5 GB. Menos de 1 MB por raid → unas **500 raids** | Con unos 10 grupos activos y una raid semanal cada uno: alrededor de un año. Después, plan de pago o archivar desgloses antiguos |
| Vercel Blob | 1–2 MB por noche y grupo, si guarda los brutos | Se activa por grupo; con muchos grupos, poner retención (por ejemplo, 1 año) |
| Cómputo | El procesado pesado ocurre en el navegador de quien sube | Solo el plan B (apartado 8) añadiría coste de funciones |
| Cron | 1 diario | — |

---

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| DuckDB-WASM no procesa una noche con fluidez (memoria, extensión JSON, navegadores) | Sin subida desde el navegador | Fase 1 al principio. **Plan B**: los `.gz` se suben a Blob y una función de Vercel con DuckDB nativo ejecuta los mismos `.sql`. **Plan C**: publicador de escritorio con el pipeline actual empaquetado |
| Diferencias al portar `raid.js` / `jugador.js` | Cifras erróneas | Paridad automática y comparación de textos visibles antes del corte |
| Datos falsificados por un cliente | Raids infladas | No hay rankings entre grupos sin verificación; auditoría; reprocesado desde los brutos (fase 11) |
| Fuga entre grupos | Grave (privacidad) | Un único punto de permisos, pruebas de la matriz y raids privadas por defecto |
| Duplicados de la misma noche | Números repetidos | Huella y elección de reemplazar o descartar |
| Questlog cambia el formato de sus archivos | Las subidas fallan | `fight.version` y `format` ya se leen: la subida avisa de versiones desconocidas y el fixture detecta roturas en el CI |
| Jugadores sin `servidor` en las 5 raids antiguas | Duplicados cuando lleguen raids v2 | Al llegar la primera raid v2 de un jugador, se le asigna el servidor si el nombre es único en el grupo; si no, se avisa |
| Noche de raid durante la migración | Raid solo en la web vieja | El `.bat` sigue en `main` hasta el corte, y la migración se vuelve a ejecutar justo antes |
| Límite de 4,5 MB por petición en funciones | Fallan subidas de brutos | Subida directa del cliente a Blob con token temporal; el JSON agregado pesa unos 50 KB |
| Encoding en PowerShell 5.1 | Tildes rotas | `publicar.ps1` envía bytes UTF-8 explícitos |

---

## 9. Esfuerzo orientativo

| Fase | Tamaño |
|---|---|
| 0 · Preparación | S (configuración en Vercel y Discord, con guía) |
| 1 · Prueba de concepto en el navegador | M |
| 2 · Esqueleto | S |
| 3 · Base de datos y cuentas | L |
| 4 · Ingesta y migración | M |
| 5 · Páginas de lectura | L (unas 900 líneas de JS a componentes) |
| 6 · Subida desde el navegador | L |
| 7 · Pipeline del PC | S |
| 8 · Nombres, solicitudes, cron y Claude | M |
| 9 · Corte | S |
| 10 · Abrir a otros grupos | M |

S = una sesión de trabajo · M = 2–3 · L = 4 o más. Hasta la fase 9, la web actual sigue funcionando sin cambios.

---

## 10. Decisiones

Tomadas:
1. **Alcance**: varios grupos, cada uno con sus registros (8/11/2026).

Pendientes, con mi recomendación:
2. **Base de datos**: Neon con Better Auth y Discord (recomendado), o Supabase.
3. **Copia de los brutos en Blob**: activada para el grupo de Cry y opcional para los demás (recomendado).
4. **URL en inglés**: `/en/...` (recomendado), con `?lang=en` redirigiendo.
5. **Nombre de la ruta de grupo**: `/g/<grupo>` (recomendado, corto) o `/grupos/<grupo>`.
6. **Análisis escrito para otros grupos**: al principio solo el perfil automático; el análisis de Claude sigue siendo para el grupo de Cry hasta que se decida la fase 11.
7. **Configuración de Vercel y Discord**: la hace el usuario desde los paneles, con una guía paso a paso en la fase 0.
