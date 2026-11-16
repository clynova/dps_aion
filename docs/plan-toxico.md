# Pestaña «Sin filtro» (análisis tóxico)

Idea del usuario (15/11/2026): en la página de la raid, una pestaña después de «Análisis», marcada en rojo como
advertencia, con un análisis cruel que solo cuenta lo malo de cada jugador y cómo dejar de hacerlo. Reglas:

- **La verdad, sin suavizar, pero solo la verdad**: cada pulla sale de una cifra de la raid y nunca contradice el
  análisis principal (se le pasa a la IA junto con los datos). Lo que el análisis principal trata como deducción
  (fallos de mecánica, buffs fuera de alcance, especializaciones) sigue siendo deducción.
- **Proporcional**: quien estuvo mal se lleva varias pullas; quien no tiene nada que destacar, una cosa y al siguiente.
- **Se critica la jugada, nunca a la persona**: nada de físico, inteligencia, familia, identidad, insultos ni groserías.
  Sin asumir el género de nadie.
- Cada jugador acaba con un «Cómo dejar de dar pena»: una mejora concreta.

## Fase 1 (esta)

- Datos: tabla `analisis_toxico` (como `analisis`: raid, idioma, contenido, autor) y `grupos.toxico` (activa la
  pestaña; apagado por defecto). Migración 0008.
- Formato (`lib/ingest/toxico.ts`): `{ titular, jugadores: { Nombre: { pullas: [1–4], mejora } }, notas? }`.
- Generación (`lib/analisis/toxico.ts`, puro: prompt, entrada y `revisarToxico`; `analizarToxico` en `ia.ts`):
  DeepSeek con el resumen de la raid + el análisis principal en español, traducción al inglés y las mismas
  comprobaciones que el principal (jugadores de `meta.grupo`, habilidades que no usa, vosotros, nombres de campos,
  traducción en español). Se genera después del análisis principal (al subir la raid, si el grupo lo tiene activo y
  no hay uno) y se rehace con el botón «Analizar con IA». Cuesta otra llamada (~2 céntimos).
- Página: pestaña `toxico` en `PESTANAS_RAID` (solo si el grupo lo activa), roja, con un aviso arriba;
  `components/raid/Toxico.tsx` la pinta en el servidor.
- Ajustes: casilla «Pestaña Sin filtro» (admin o más).

## Después (sin hacer)

- Premios de la vergüenza calculados en código (Imán de mecánicas, Alfombra oficial, El Pacifista, Abridor de
  wipes…), para que esas cifras no dependan de la IA.
- `publicar.ps1 -Toxico` para que Claude escriba la suya al hacer «Analiza la última raid».
- Rehacerlo cuando Claude publica un análisis principal nuevo (hoy se queda el que se hizo sobre el de DeepSeek).

## Fase 1b (15/11/2026, tras verla en producción)

La primera versión salió plana: la IA solo tenía los datos en bruto y temperatura 0,4, y escribió la misma frase
para cuatro jugadores («el jefe te mata de un solo impacto y tú sigues en el mismo sitio»), además de colar «os» y
especializaciones. Cambios: material por jugador calculado en código (`materialToxico`), ejemplos de tono de otros
ámbitos, temperatura 1,1, comprobaciones nuevas (vosotros completo, talentos, roles por clase, pullas largas o con
listas de ataques, ejemplos copiados) y «Rehacer» en el botón de la pestaña (una vez por hora).
