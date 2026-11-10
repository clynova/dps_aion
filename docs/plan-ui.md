# Plan de mejora visual: la misma información, más fácil de leer

Fecha: 10 de noviembre de 2026 · Estado: fases 0–5 desplegadas (hasta 389bc79); fase 6 hecha; queda la 7

Fase 3 (10/11/2026): «Cómo muere cada uno» como barra apilada por jugador con avisos en chips (la tabla, plegada); «Quién recibe golpes que el resto evita» enseña solo a quien destaca, con barra de diferencia, y al resto en una línea; «Ataque por ataque» enseña los ataques con algún ▲ (los otros, plegados) y fija la columna del ataque; debuffs: los 3 que más mantiene cada jugador, con barras (todos, plegados); «Qué pasó con las recomendaciones», una línea por recomendación con sus ataques al desplegarla; en las gráficas, las etiquetas que no caben se recortan con «…» y el nombre entero va en el tooltip; en el móvil la barra de pestañas enseña la abierta.

Pedido del usuario (10/11/2026): «DPS de la party» en el Resumen, al lado de la vida quitada (barra por jugador, media del grupo, % de críticos a la derecha; pulsar abre la ficha). La **precisión** no se muestra: el registro no trae la estadística de precisión del jugador (solo GS y CP) y los únicos «fallos» contra el jefe son `resist` que casi siempre llegan en el mismo instante que un golpe de la misma habilidad que sí hizo daño (efecto resistido, no ataque fallado); solo 1–2 jugadores por raid los tienen. Comprobado con `db/aion.duckdb` en las raids del 8–10/11.

Fase 4 (10/11/2026): todos los nombres de jugador de las secciones del servidor enlazan a su ficha (`components/raid/NombreJugador.tsx`, `#<jugador>`); selector «Soy…» (localStorage `dps-aion:soy`, solo comodidad) que resalta a ese jugador en toda la página (filas con `:has()`, negrita en las gráficas) y pone «Tu raid» arriba del Resumen: puesto en DPS, DPS/HPS/muertes/crítico frente a la media y sus consejos.

Fase 5 (10/11/2026): perfil del jugador con «En resumen» arriba (resumen de Claude, sus 3 primeras recomendaciones y de cuándo es el texto); pestaña nueva «Perfil», la primera y la que se abre sin #hash, con fortalezas y qué mejorar en dos columnas y las recomendaciones; el perfil automático, plegado debajo si hay texto de Claude y como única tarjeta (abierta, con el aviso) si no; pestañas fijas arriba como en la raid.

Fase 6 (10/11/2026): página del jefe con «Dónde se atasca» arriba cuando no hay kill (tramo con más wipes, el ataque que sale a ese % de vida si cae a 5 puntos o menos —una deducción— y lo que más cierra esos intentos) y el texto de sus SVG a tamaño fijo en pantalla (`components/jefe/GraficoAjustado.tsx` pone `--k`); página del grupo con las raids agrupadas por día, los jefes secundarios en «+N jefes más» (detalle en el tooltip) y barra bajo el mejor intento.

Hecho el 10/11/2026:
- Fase 0: `scripts/capturas.mts` (una captura por ruta, ancho, tema y pestaña, con `alturas.tsv`).
- Fase 1: títulos de sección en serif más grandes; `components/ui/Explicacion.tsx` (subtítulo de una línea + «Cómo se calcula» plegado) en las 11 tarjetas del servidor con nota larga; especializaciones en rejilla.
- Fase 2: cabecera de la raid con «Desde la raid anterior» en una línea y «Qué cambiar» (3 primeras recomendaciones); 7 pestañas con `#hash` (`PESTANAS_RAID`); los consejos de cada jugador, también en la pestaña «Análisis», con enlace a su ficha. Un `#Jugador` de antes sigue abriendo su ficha.
- Medido con los datos de la raid del 10/11: la pestaña Resumen ocupa 1,8 pantallas en escritorio y 2,8 en móvil (antes, la página entera: 14 y 19).
- Pendiente visto al probar: en móvil, las etiquetas largas de «Muertes por habilidad» se cortan por la izquierda (ya pasaba antes; fase 3/7).

## Diagnóstico (medido en producción el 10/11/2026)

Capturas con Playwright de https://dpsaion.vercel.app, a 1366 px (escritorio) y 390 px (móvil), con la raid `2026-11-10-0009-ludra-de-la-eternidad`.

| Página | Escritorio | Móvil | Contenido |
| --- | --- | --- | --- |
| Raid | **14 pantallas** | **19 pantallas** | 10 secciones, 21 tarjetas, 38 tablas, 40 notas de explicación, ~3400 palabras visibles |
| Jefe | 4,6 | 4,8 | 4 secciones |
| Grupo | 2,7 | 5,0 | jefes, evolución, jugadores, 13 raids |
| Jugador | 2,5 | 4,6 | ya usa pestañas |

No hay scroll horizontal en ninguna. El problema no es de diseño roto, es de **orden y de densidad**:

1. **Lo más útil está al final.** En la raid, «Análisis y qué cambiar» empieza en la pantalla 11 y «Desde la raid anterior» en la 12. Antes hay 8 secciones de evidencia. Quien entra quiere saber primero *qué pasó y qué cambiar*, y la evidencia después.
2. **Cada tarjeta empieza con un párrafo de método.** Las 40 `rx-note` ocupan 2–4 líneas cada una y repiten ideas («es una deducción con umbrales fijos» sale 6 veces). Son necesarias, pero no tienen que leerse antes que el dato.
3. **Tablas donde el dato importante es la excepción.** «Cómo muere cada uno» (8 columnas, la mitad de las celdas vacías), «Ataque por ataque» (20 × 12), «Debuffs sobre el jefe» (40 filas) y «Especializaciones» (2099 px: tablas estrechas apiladas que usan el 40 % del ancho). Lo que hay que ver son los ▲/▽ y los colores, y quedan perdidos entre celdas normales.
4. **La ficha de cada jugador, la mejor pieza de la página, está escondida**: solo aparece al pulsar una fila de la tabla de la pantalla 10, y nada lo anuncia.
5. **Jerarquía débil.** El título de sección (`rx-h2`) y el de tarjeta (`h3`) tienen casi el mismo tamaño; no se distingue dónde empieza un bloque. Los números grandes (tiles) sí funcionan bien.
6. **Detalles sueltos**: en la página del jefe el texto de las gráficas escala con el ancho (el «100 %» sale enorme); en el grupo cada raid repite «Reactor de fusión abismal central: matado»; en «Desde la raid anterior» cada recomendación ocupa 5–10 líneas de cifras.

Lo que ya está bien y se conserva: los tokens de color con modo oscuro (`styles/site.css`), las fuentes, los tiles, la ficha del jugador (tiles + recomendaciones + 4 gráficas), las pestañas del perfil y el titular del análisis arriba del todo.

## Principios

1. **Respuesta primero, evidencia después.** Cada página responde en la primera pantalla: ¿cómo fue?, ¿qué nos para?, ¿qué cambio? El resto es para quien quiera comprobarlo.
2. **Revelar por capas, sin quitar nada.** Todo dato que hoy se ve sigue a 1–2 clics como mucho (pestaña, «ver todos», `<details>`). Ninguna cifra desaparece.
3. **Una frase de subtítulo; el método, plegado.** Cada tarjeta lleva una línea que dice qué se ve. La explicación del cálculo va a un «Cómo se calcula» plegable.
4. **Destacar la excepción.** Tablas y matrices enseñan primero lo que se sale (▲/▽, quién recibe más, quién muere antes) y el resto detrás de «ver todos».
5. **Pensado para el jugador.** Casi todos entran a mirar *su* parte: que su nombre sea fácil de encontrar y lleve a su ficha desde cualquier tabla.

## Propuesta por página

### Raid (la que más gana)

**Cabecera nueva (primera pantalla, sin hacer scroll):**
- Título, fecha, chips de resultado (como ahora).
- Titular del análisis (como ahora).
- Tiles (como ahora) + una fila de 3 indicadores de «Desde la raid anterior» (mejor intento ▲, muertes por intento =, DPS ▲) con enlace al detalle.
- **Las 3 primeras recomendaciones** del análisis, solo el título, con «ver el análisis completo».

**Pestañas con `#hash`** (el perfil ya las usa y `lib/legado` ya escucha el hash):

| Pestaña | Contenido (lo que hoy está suelto) |
| --- | --- |
| Resumen | Cabecera + «Vida quitada en cada intento» + «Muertes por habilidad» (las dos gráficas que más se entienden) |
| Intentos | Curva de vida, «Contra el mejor intento» (la tabla «Tiempo y muertes hasta cada %» plegada), enlace a la página del jefe |
| Muertes | Qué castea el jefe y cuándo, «Cómo muere cada uno» y «Muerte a muerte» |
| Mecánicas | Quién recibe golpes que el resto evita, Ataque por ataque |
| Daño | Ventanas de daño, debuffs, DPS de cada jugador en cada intento, especializaciones y buffs |
| Jugadores | Tabla + ficha |
| Análisis | Recomendaciones completas, consejos por jugador, «Desde la raid anterior» completo, notas |

Objetivo: la pestaña Resumen cabe en ~2,5 pantallas de escritorio y ~5 de móvil (hoy 14 y 19 la página entera).

**Cambios dentro de las secciones:**
- «Cómo muere cada uno»: tabla de 8 columnas → **barra apilada por jugador** (de un golpe / en ráfaga / por desgaste) con los avisos (sin sanador vivo, medio grupo caído, defensivo libre) como chips. La tabla, plegada debajo.
- «Ataque por ataque»: por defecto, **solo los ataques donde alguien tiene ▲**, con la primera columna fija al hacer scroll en móvil; «ver los 20 ataques» abre la matriz entera.
- «Quién recibe golpes que el resto evita»: los ▲ arriba con su barra de diferencia; los «Nada que destaque» agrupados en una línea.
- «Debuffs sobre el jefe»: una fila por jugador con barras pequeñas (activo / en rotura) y top 3; el resto plegado.
- «Especializaciones»: las tablas de cada clase **en rejilla de 2–3 columnas** (hoy apiladas al 40 % del ancho) y, por defecto, solo las habilidades con opciones distintas.
- «Desde la raid anterior»: cada recomendación en una línea (título + resultado ▲/▼/=), con sus cifras por ataque plegadas.

**Jugadores:**
- Los nombres de jugador en **todas** las tablas enlazan a su ficha (`#jugadores/<nombre>`), no solo la tabla de rendimiento.
- Selector «Soy…» (guardado en `localStorage`, por comodidad; la página funciona igual sin él) que resalta tu fila en todas las tablas y pone tu ficha y tus consejos en la cabecera del Resumen.
- La fila de la tabla dice que se puede pulsar (icono «›» y texto en la nota).

### Jugador

- Arriba, el **resumen** del análisis de Claude (2–3 líneas) y sus 3 recomendaciones; «Fortalezas» y «Qué mejorar» plegables o en dos columnas cortas.
- El perfil automático se junta con el de Claude en una sola tarjeta «Puntos fuertes / A vigilar / Tendencia» cuando no hay análisis de Claude, y queda como apoyo cuando lo hay (hoy compiten lado a lado).
- Las pestañas se mantienen; se hacen fijas (sticky) al bajar.

### Jefe

- Texto de las gráficas a tamaño fijo (no escalado con el `viewBox`), como en la raid.
- Arriba, una frase del estado: «Sin kill; el muro está en el 70–75 %, donde sale el ataque C».

### Grupo

- En cada raid de la lista, quitar los chips repetidos de jefes secundarios («Reactor…: matado») o dejarlos como un icono con tooltip.
- Raids agrupadas por noche/jefe, con el mejor intento como barra pequeña en vez de solo el número.

## Sistema visual (base común)

- **Jerarquía**: `rx-h2` más grande y con más aire encima que el `h3` de tarjeta; subtítulo de tarjeta en una línea (`--fs-caption`).
- **Componentes** nuevos en `components/ui/`: `Tarjeta` (título, subtítulo, «Cómo se calcula» plegado, acción «ver todos»), `Pestanas` (con `#hash`, sin JavaScript para el contenido del servidor), `Chip` (▲ mejor / ▼ peor / = igual / aviso), `BarraApilada`, `TablaRecortada` (top N + «ver todos»).
- **Tablas**: celdas vacías en gris suave («·»), números alineados con `tabular-nums`, primera columna fija en tablas anchas en móvil.
- **Gráficas**: tamaño de texto fijo en todas (11–12 px), misma leyenda y mismos colores para ▲/▽ y «mata de un golpe».
- **Textos**: todo en `lib/i18n/es.json` / `en.json`; las notas largas se parten en subtítulo (corto) + método (plegado), sin perder lo que dicen.
- Comprobar siempre en claro y oscuro, escritorio y móvil.

## Fases

Cada fase se despliega sola, con `npm run typecheck && npm run lint && npm test && npm run build` y capturas antes/después.

| Fase | Qué | Toca | Riesgo |
| --- | --- | --- | --- |
| 0 | Script de capturas (`scripts/capturas.mts`: páginas de raid, jugador, jefe y grupo; es/en; escritorio/móvil; claro/oscuro) para comparar antes y después | `scripts/` | Ninguno |
| 1 | Base: jerarquía de títulos, componentes `Tarjeta`/`Chip`/`Pestanas`, texto fijo en gráficas, «Cómo se calcula» plegable en las secciones del servidor | `styles/`, `components/ui/`, `components/raid/*`, i18n | Bajo |
| 2 | Raid: cabecera con las 3 recomendaciones y el resumen de «Desde la raid anterior»; pestañas con `#hash` y el reparto de secciones | `PlantillaRaid.tsx`, `lib/legado/raid.ts` (mismos ids), `app/[lang]/g/[grupo]/raids/…` | Medio: el código de `lib/legado` dibuja con el ancho del contenedor; hay que redibujar al mostrar una pestaña (como hace el perfil) |
| 3 | Raid: secciones a formato visual (barras apiladas, matriz filtrada, especializaciones en rejilla, seguimiento en una línea) | `components/raid/*`, `lib/raids/*` (solo presentación; las funciones puras no cambian) | Bajo: las pruebas de `lib/raids` siguen valiendo |
| 4 | Jugadores: nombres enlazados a su ficha en todas las tablas, selector «Soy…» | `lib/legado/raid.ts`, componentes de raid | Bajo |
| 5 | Perfil del jugador: resumen arriba, perfil automático junto al de Claude, pestañas fijas | `PlantillaPerfil.tsx`, `lib/legado/perfil.ts` | Bajo |
| 6 | Jefe y grupo: frase de estado, gráficas, lista de raids | `components/jefe/`, `components/grupo/`, `lib/legado/grupo.ts` | Bajo |
| 7 | Repaso en móvil y modo oscuro de todo lo nuevo | CSS | Bajo |

Orden recomendado: 0 → 1 → 2 (lo que más se nota) → 3 → 4 → 5 → 6 → 7.

## Cómo sabremos que funciona

- La primera pantalla de la raid enseña el titular, los tiles y las 3 primeras recomendaciones, en escritorio y en móvil.
- La pestaña Resumen ocupa ≤ 2,5 pantallas de escritorio y ≤ 5 de móvil.
- Ninguna tarjeta muestra más de una línea de explicación sin desplegar.
- Ninguna cifra desaparece: cada dato que hoy está en la página se alcanza en 2 clics o menos (lista de comprobación por sección).
- Sin scroll horizontal a 390 px; todo legible en claro y oscuro.

## Decisiones abiertas

1. ~~Pestañas o página única con índice fijo y secciones plegables.~~ **Decidido (10/11/2026): pestañas**, enlazables por `#hash`, como en el perfil.
2. **Selector «Soy…»**: útil para jugadores, pero añade un control más. Se puede dejar para la fase 4 y decidir con la página ya reordenada.
3. **Maqueta antes de programar**: se puede hacer primero una maqueta estática de la nueva cabecera y pestañas de la raid para validar el orden antes de tocar `lib/legado`.
