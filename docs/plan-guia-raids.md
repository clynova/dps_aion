# Plan: módulo «Raids» — guía de cada raid y de cada jefe

Fecha: 10 de noviembre de 2026 · Estado: fases 0 y 1 desplegadas (97b30a9, fd40640); fase 2 desplegada (1689e71); fase 3 desplegada (9b1d3c6); fase 4 desplegada (b263465); fase 5 hecha

Fase 5 (10/11/2026): pestaña «Por clase» (`porClase` en `lib/guia/datos-jefe.ts`, puro y con pruebas): por cada clase contra ese jefe, las 6 habilidades con más parte del daño (media de todos sus jugador-raid; los que no la usan cuentan 0) y qué parte la usa, la especialización más usada de cada una (del `especializaciones` de la raid: la más habitual, nunca «la mejor») y, del repaso de muertes, en cuántas muertes tenía un defensivo propio libre (con la misma regla que `lib/raids/repaso.ts`, sin contar las de un golpe). En Ludra: el Clérigo tenía «Poder de Yustiel» libre en 16 de 184 muertes; Gladiador, Arquero, Asesino y Espiritualista no tienen defensivos propios en el registro.

Fase 4 (10/11/2026): pestaña «Equipo y grupo» en la ficha del jefe (`equipoJefe` en `lib/guia/datos-jefe.ts`, puro y con pruebas): GS de entrada (ficha de la raid), GS de quien lo mató y de quien lo intentó (rango y mediana), clases en el intento de cada kill (media por kill) y % de golpes críticos contra el jefe por clase (mediana y rango del `crit_pct` de cada jugador en cada raid). Las fichas ganan `equipo` (afirmaciones) y Ludra `requisitos.critico` 1.700–2.100 (deducción con timesaver y Aion 2 Maps). **Medido en `db/aion.duckdb`: el % de críticos pasa del 50 %** (Asesino ~70 %, Gladiador ~63 %), porque con el jefe roto el 98,5–99,5 % de los golpes son críticos y hay habilidades con crítico garantizado; por eso no se compara a nadie con el tope del 50 %, sino con su clase. Por la espalda, solo 1–2,4 puntos más (las guías: 3–10). La precisión no se mide (el registro no la trae): solo lo que dicen las guías, que no coinciden.

Fase 3 (10/11/2026): la página de cada jefe va en pestañas (Resumen, Mecánicas, Fases y tiempos, Fuentes; `components/guia/Pestanas.tsx`, #hash, y un #m-<mecánica> abre la suya) con datos en vivo de las raids públicas de grupos visibles con ese jefe como principal (`lib/guia/datos.ts` carga y reconstruye; `lib/guia/datos-jefe.ts`, puro, junta con `analizarJefe`): cifras, kill más rápido, lo que hace wipe, lo que más mata (muertes por intento), dónde se atasca, «Tu grupo en este jefe» (con sesión), muertes y momento de cada mecánica por sus ataques, «El combate por % de vida» (`LineaVida.tsx`: fases de la ficha, wipes por tramo y ataques «por vida») y el cronograma en vida que queda. Solo totales: ni grupos ni raids enlazados. El Reactor nunca es jefe principal: solo cifras. Comprobado con las raids públicas de producción (API): Ludra, kill más rápido 7:17 y más wipes entre el 25 y el 20 %; Rahu, 5:24 y entre el 65 y el 60 %.

Fase 2 (10/11/2026): fichas del Reactor, Rahu, Ketu y Ludra en `contenido/raids/ludra/<npc>.{es,en}.json` (el inglés se genera desde el español cambiando solo los textos) y su página (`components/guia/FichaJefe.tsx`: fases, mecánicas con las de wipe primero, consejos por rol, notas y fuentes). **Todas las guías publicadas describen la versión anterior** (Corea y acceso anticipado); ninguna, a 10/11, la global del 4/11. Por eso cada mecánica lleva `en_datos` (visto / probable / sin_ver) y los nombres de los ataques que cita (de la semilla `nombres*.json`, en `contenido.generado.json`). Confirmado con nuestros datos: «Prueba de Ludra» (el tablero) al 51 % y al 25 % y la rotura de 10,1–10,2 s unos 20 s después; las fases de Rahu salen hacia el 65, 49 y 32 % (las guías: 75, 50, 25). Ketu: solo 3 intentos registrados, todo «sin ver». Fuentes leídas de verdad: aion2tierlist, Metaroad, expcarry, aion2turkiye (u4gm leída, no citada: web de venta de oro; Mobalytics y MMOPIXEL bloquean la descarga). Sin «vosotros» en los textos.

Fase 1 (10/11/2026): ruta `/guias` (`/raids/<slug>` ya era la redirección de la web estática), enlace «Raids» en `components/BarraSuperior.tsx` (todas las páginas), índice `app/[lang]/guias/page.tsx`, ficha de la raid `guias/[raid]` y del jefe `guias/[raid]/[npc]` (solo los npc de `jefes` de la ficha; el jefe aún «en preparación» con sus cifras). Ficha de Ludra en `contenido/raids/ludra/raid.{es,en}.json`: nombre del juego («Forja Abismal», como en sus títulos), orden Reactor → Rahu/Ketu → Ludra y límite de 60 min sacados de las 10 entradas de `db/aion.duckdb`; 600082 = Normal es una deducción (GS mínima 2823 < 3000). `npm run contenido` escribe además `lib/guia/contenido.generado.json` (lo que importan las páginas, `lib/guia/contenido.ts`; una prueba exige que esté al día). Cifras públicas (`lib/guia/cifras.ts`, suma pura en `sumar-cifras.ts`): raids públicas de grupos visibles, jefe principal o en `raid_otros`, solo totales; tras `connection()` y, si la base falla, «no disponibles» sin romper la página (solo se registra el tipo de error: el de Neon puede llevar la cadena de conexión). El CDN de questlog.gg responde 403 al Chrome sin ventana de Playwright: en las capturas los retratos salen rotos, en un navegador normal cargan.

Fase 0 (10/11/2026): `npm run juego` (`scripts/estructura-juego.mjs`, solo en el PC) vuelca a `contenido/juego/estructura.json` 58 mazmorras, 177 jefes con nombre es/en y retrato, y 540 stats (la de crítico dice, en el propio juego, que el tope es el 50 % menos la resistencia del objetivo). `contenido/raids/fuentes.json`: 21 fuentes (4 del juego u oficiales, 17 guías; aún sin leer a fondo: eso es la fase 2). Esquema Zod en `lib/guia/esquema.ts` y validación entera en `lib/guia/validar.ts` (es/en iguales salvo los textos, fuentes que existan, «guias» con 2 fuentes o más, «oficial» con fuente oficial, ids de mazmorra y jefe que existan en la estructura). `npm run contenido` la ejecuta y va al principio de `build` y `build:vercel`: una ficha mal hecha para el despliegue. Pruebas: `tests/unit/guia.test.ts`.

## Qué se pide

Una sección nueva, enlazada desde la barra de arriba, con todo lo que hace falta saber de cada raid: jefes que la forman, mecánicas (y cuáles hacen wipe), consejos por rol, composición, habilidades, equipo, crítico y precisión recomendados, con gráficos, infografías y cifras.

## La idea que lo hace distinto

Hay muchas guías de Ludra en internet (ver «Fuentes»), y casi todas se copian entre sí, se contradicen y describen versiones viejas del encuentro. Lo que **solo tiene esta web** son los registros reales de las raids. El módulo junta las dos cosas en cada ficha:

- **Lo que dicen las guías**: texto propio, resumido y contrastado, con la fuente enlazada y la fecha. Nunca copiado.
- **Lo que dicen nuestros datos**: cronograma real de ataques, qué mata, en qué % se atascan los grupos, GS y clases de los grupos que lo mataron, crítico medido contra el jefe. Sale de la base y se actualiza solo con cada raid.

Cuando las dos no coinciden, se dice (por ejemplo: «las guías dicen que la ventana de rotura dura 10 s; en nuestras raids dura de media 8,4 s»).

## Fuentes (exploradas el 10/11/2026)

### Datos del juego (fiables, se leen solos)

| Fuente | Qué trae | Cómo se usa |
| --- | --- | --- |
| `%APPDATA%\Questlog\aion-2\game-data-v2.json` (local) | `dungeons` → jefes de cada mazmorra (p. ej. 600082 = Rahu 2301006, Ketu 2301007, Reactor 2301008, Ludra 2301014; 600083 = la otra dificultad), `bosses`, `stats` (540, con nombre y descripción: `accuracy`, `pveaccuracy`, `critical`, `criticalresist`, `limitcritical`…), `buffEffects` (qué stat cambia cada buff) | Estructura de cada raid y glosario de stats. Volcar a una semilla del repo como `nombres.json` |
| API de questlog.gg (`combatLog.entities.skills` / `.names`), CDN de iconos | Nombres es/en e iconos de habilidades y NPC | Ya se usa (`nombres`, `apodos`) |
| `db/aion.duckdb` y la base de Neon | Casteos del jefe, golpes, muertes, roturas, vida, clases, GS y CP de cada jugador, crítico | Todas las cifras y gráficos «de nuestros datos» |
| [Notas de parche oficiales](https://aion2.plaync.com/en-us/board/update/view?articleId=6aead0e86cfe4756db5b913f) (NCSOFT) | Fechas, modos, límites (1 h por run), recompensas | Ficha de la raid; fuente de autoridad para lo que cambia por parche |
| [MetaBot](https://metabot.gg/en/aion-2) ([metodología](https://metabot.gg/en/aion-2/methodology)) | Base de datos leída del cliente: mazmorras, 48 jefes, botín | Botín y comprobación cruzada de datos del juego |

### Guías de la comunidad (útiles, pero contradictorias: siempre 2+ fuentes y fecha)

- Mecánicas de Ludra, Rahu y Ketu: [Mobalytics Ludra](https://mobalytics.gg/gamebase/guides/aion-2-ludra-boss), [Rahu](https://mobalytics.gg/gamebase/guides/aion-2-rahu-boss-guide), [Ketu](https://mobalytics.gg/gamebase/guides/aion-2-ketu-boss), [Aion 2 Maps](https://aion2maps.com/guides/ludra/), [aion2tierlist](https://aion2tierlist.com/guides/aion-2-ludra-raid-guide), [aion2turkiye](https://aion2turkiye.com/en/dungeons/ludra/), [expcarry](https://expcarry.com/aion-2-ludra-boss-guide). Discrepancias ya vistas: si cada party hace su jefe intermedio o los dos a la vez; 8 o 10 jugadores; mecánicas de la versión coreana o de acceso anticipado.
- Precisión y crítico: [Aion 2 Maps](https://aion2maps.com/guides/accuracy-and-crit/), [MMO Herald (fórmula de daño)](https://www.mmoherald.com/aion-2/guides/damage-calculation), [timesaver.gg](https://timesaver.gg/blog/aion-2-accuracy-cap), [akunito (fórmulas)](https://aion2.akunito.com/en/systems/stats/), [MMOPIXEL (equipo)](https://www.mmopixel.com/news/aion-2-best-endgame-gear-guide). Lo que coinciden: el crítico tiene tope del 50 % en global (80 % en Corea) menos la resistencia del jefe. Las cifras para Ludra global **no coinciden**: precisión ~1200–1450, crítico ~1200–1700, según la fuente.
- Composición y clases: [MetaBot tier list](https://metabot.gg/en/aion-2/guides/best-class-tier-list), [Mobalytics PvE](https://mobalytics.gg/gamebase/guides/aion-2-pve-tier-list), [mein-mmo](https://mein-mmo.de/en/aion-2-tier-list-the-best-classes-in-pve,1589844/). Consenso: Templario, Clérigo y Cantor; 2 parties de 5.
- Equipo y GS: [MetaBot progresión](https://metabot.gg/en/aion-2/guides/gear-progression-guide), [timesaver GS](https://timesaver.gg/blog/aion-2-gear-score-guide) (Normal 2800, Difícil 3000, según terceros; la nota oficial no lo dice).
- Corea (va por delante en contenido): foros de [Inven](https://www.inven.co.kr/board/aion2/6446/9956) e [Inven Global](https://www.invenglobal.com/articles/25688/aion-2-unveils-new-raid-content-snowfield-of-grief) (próxima raid «Snowfield of Grief»). Útil para adelantarse, con traducción y la advertencia de que es otra versión.

### Lo que **no** se puede sacar de ningún sitio fiable

- **La precisión del jugador**: el registro de Questlog no la trae (solo GS y CP; comprobado en el plan de mejora visual). Solo se pueden dar los rangos de las guías, como rango y con fuente.
- **Cifras de stats del jefe** (resistencia al crítico, evasión): solo en guías datamineadas, sin confirmar.

## Reglas del contenido

1. **Texto propio, nunca copiado** de las guías (ni imágenes ni capturas). Se resume con nuestras palabras, se enlaza la fuente y se pone la fecha. Las infografías se dibujan aquí, en SVG.
2. **Cada afirmación lleva su origen**: `juego` (datos del cliente), `oficial` (NCSOFT), `datos` (nuestras raids, con cuántos intentos), `guías` (con 2+ fuentes) o `deducción`. La página lo enseña con una etiqueta pequeña.
3. **Cada ficha dice para qué versión es**: parche y fecha de la última revisión. Si sale un parche que toca la raid, la ficha muestra un aviso hasta que se revise.
4. **Mecánicas ligadas a ids de ataque**: cada mecánica de la guía apunta a los ids de `casteos` / `apodos` (p. ej. 1803230 «Invoca la zona 11-2»). Así la ficha puede enseñar cuándo sale en nuestras raids y cuánta gente muere por ella, y la página de la raid puede enlazar cada ataque a su explicación.
5. Bilingüe es/en como todo lo demás; textos de interfaz en `lib/i18n`, contenido en sus propios archivos.
6. Privacidad: las cifras «de nuestros datos» salen por defecto **solo de raids públicas** y siempre agregadas (sin nombres de jugadores). Si se agregan raids de varios grupos, hay que actualizar `/privacidad` y `PRIVACIDAD_ACTUALIZADA`.

## Modelo de contenido

Contenido editorial en el repo (revisable en git, bilingüe, pequeño), validado con Zod en el build, como `nombres.json`:

```
contenido/raids/<raid>/raid.{es,en}.json        ← ficha de la raid
contenido/raids/<raid>/<npc>.{es,en}.json       ← ficha de cada jefe
contenido/raids/fuentes.json                    ← catálogo de fuentes (url, tipo, idioma, fecha de consulta)
contenido/juego/estructura.json                 ← volcado de game-data-v2 (mazmorras → jefes, stats)
```

Ficha de jefe (borrador):

```json
{
  "npc": [2301014, 2300290],
  "revisado": "2026-11-10", "parche": "2026-11-04",
  "resumen": "Una o dos frases.",
  "fases": [{ "titulo": "…", "desde_vida": 100, "hasta_vida": 70, "texto": "…" }],
  "mecanicas": [{
    "id": "agujeros-negros", "titulo": "…", "texto": "…",
    "ataques": [1803230, 1803235], "wipe": true, "roles": ["todos"],
    "como": "Qué hacer, en una línea.", "fuentes": ["mobalytics-ludra", "aion2maps-ludra"],
    "origen": "guías", "infografia": "ludra-agujeros"
  }],
  "consejos": { "tanque": ["…"], "sanador": ["…"], "dps": ["…"], "apoyo": ["…"] },
  "requisitos": { "gs": { "normal": 2800, "dificil": 3000, "fuentes": ["…"] },
                  "precision": { "min": 1200, "max": 1450, "fuentes": ["…"] },
                  "critico":   { "min": 1200, "max": 1700, "tope_pct": 50, "fuentes": ["…"] } },
  "notas": [{ "termino": "Versión", "texto": "…" }]
}
```

Las cifras «de nuestros datos» **no** van en estos archivos: se calculan al pintar la página desde la base, con `lib/raids/jefe.ts` (que ya saca cronograma, muro y qué mata por grupo) generalizado a todas las raids públicas.

## Páginas

- **Barra de arriba**: hoy `components/BarraSuperior.tsx` solo tiene contexto, cuenta e idioma. Se añade un enlace «Raids» (y quizá «Mis grupos») visible en todas las páginas, también en el móvil.
- **`/raids-guia`** (nombre por decidir; `/raids` y `/guia` ya existen): índice con cada raid, su modo, sus jefes (de `estructura.json`), GS de entrada y, de nuestros datos, cuántos kills y wipes hay registrados.
- **`/raids-guia/<raid>`**: ficha de la raid. Jefes en orden con su icono y una línea, composición recomendada, requisitos, recompensas, reglas (límite de 1 h, modos), enlaces a cada jefe.
- **`/raids-guia/<raid>/<jefe>`**: ficha del jefe, con pestañas como la raid:

| Pestaña | Contenido |
| --- | --- |
| Resumen | Qué es, 3–5 mecánicas que matan (las `wipe` primero), requisitos, «Tu grupo en este jefe» si quien mira tiene grupo (enlace a `/g/<grupo>/jefes/<npc>`) |
| Mecánicas | Cada mecánica: texto, «qué hacer», infografía, roles, y de nuestros datos: cuándo sale (segundo / % de vida, del cronograma deducido), cuántos mueren por ella, cuánta gente la evita (de `mecanicas`) |
| Fases y tiempos | Línea de tiempo del combate dibujada con nuestros casteos (como la página del jefe, pero de todas las raids públicas), roturas y su duración real, curva de vida típica de un kill, muro de wipes por % |
| Composición | Recomendada (guías) frente a la de los grupos que lo mataron (clases por kill de nuestros datos), roles por party |
| Equipo y stats | GS de entrada (oficial/guías) y GS medio de los grupos que lo mataron; precisión (solo rango de guías, con la advertencia de que no se puede medir); crítico: rango de las guías y el **% de crítico medido contra este jefe** por clase en nuestras raids, con el tope del 50 %; glosario de stats de `estructura.json` |
| Por clase | Habilidades que más daño hacen contra este jefe por clase (`detalle`), especializaciones más usadas en los kills (`especializaciones`), defensivos útiles contra sus ataques fuertes (del repaso de muertes). Sin atribuir DPS a una opción |
| Fuentes | Todas las fuentes de la ficha con fecha, y «qué discrepa» |

## Gráficos e infografías

- **De datos (automáticos, SVG del servidor, reutilizando lo que ya pinta la página del jefe)**: cronograma de ataques, muro de wipes, curva de vida de los kills, roturas, qué mata (barras), % de crítico por clase con la línea del tope, GS de los kills (puntos), composición de los kills (mosaico de clases).
- **Infografías hechas a mano (SVG por mecánica)**: posiciones (orbes de Ludra, tablero, agujeros negros, círculo de Rahu, cristales de Ketu). Diagramas esquemáticos propios, sin calcar imágenes de nadie. Son las más caras: se hacen solo para las mecánicas `wipe`.
- **Tiles**: GS de entrada, duración de un kill, intentos hasta el primer kill (mediana), muertes por kill, ataques que hacen wipe.

## Fases

Cada fase se prueba de punta a punta y se despliega por separado (como los planes anteriores).

0. **Fuentes y estructura.** Catálogo `fuentes.json`; script que vuelca `game-data-v2.json` a `contenido/juego/estructura.json` (mazmorras, jefes, stats en es/en con los nombres de questlog.gg); esquema Zod de las fichas. *Hecho cuando*: una prueba valida los archivos y el build falla si una ficha es incorrecta.
1. **Ruta, menú e índice.** Enlace en la barra de arriba, índice de raids con jefes y cifras de nuestros datos, páginas vacías con «en preparación». *Hecho cuando*: se ve en producción, es/en, móvil sin scroll lateral.
2. **Investigación de Ludra (contenido).** Con la habilidad de investigación profunda: 3+ fuentes por jefe (Rahu, Ketu, Reactor, Ludra), contrastadas con nuestros casteos y apodos; cada mecánica ligada a sus ids; discrepancias anotadas. Lo revisa el usuario (que juega la raid) antes de publicar. *Hecho cuando*: las 5 fichas (raid + 4 jefes) en es/en pasan la validación y el usuario las da por buenas.
3. **Ficha del jefe con datos.** Pestañas Resumen, Mecánicas y Fases y tiempos, con las cifras de todas las raids públicas (`lib/raids/jefe.ts` generalizado, puro y con pruebas).
4. **Composición, equipo y stats.** Composición y GS de los kills, crítico medido por clase frente al tope, rangos de precisión y crítico de las guías. *Comprobar antes*: cómo sale el % de crítico contra el jefe en `golpes` (por clase y por jefe) y si el tope del 50 % se ve en los datos.
5. **Por clase.** Habilidades, especializaciones y defensivos por clase contra cada jefe.
6. **Infografías de las mecánicas que hacen wipe.**
7. **Enlaces cruzados.** Desde la raid (pestaña Mecánicas, repaso de muertes, análisis) cada ataque con ficha enlaza a su mecánica; desde la ficha, «Tu grupo en este jefe»; el análisis de Claude y el de DeepSeek pueden citar la mecánica de la guía (se manda como contexto).
8. **Mantenimiento.** Aviso «revisar» cuando un parche nuevo toca la raid; flujo «Actualiza la guía de <raid>» en `CLAUDE.md` (investigar, contrastar con datos, publicar), como «Analiza la última raid».

Después: la próxima raid (las de Corea van por delante, p. ej. «Snowfield of Grief») se añade repitiendo las fases 2–6 solo con contenido.

## Decisiones abiertas

- Nombre y ruta del módulo («Raids», «Guías», «Compendio»…) y si va primero en la barra.
- ¿Cifras solo del grupo de quien mira, de todas las raids públicas o de todos los grupos agregados? (Cambia la página de privacidad.)
- ¿Quién puede editar el contenido? Propuesta: solo por el repo (Claude + revisión del usuario). Más adelante, sugerencias de los grupos desde la web.
- ¿Una ficha por jefe para Normal y Difícil juntas (dos npc, 600082 y 600083) o separadas? Propuesta: juntas, con las diferencias marcadas.
