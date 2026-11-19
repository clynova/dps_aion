# Simulador de la Prueba de Ludra (el «bingo»)

Una herramienta para ensayar el reparto del tablero: se colocan los jugadores de la party, se dibuja el camino de cada
uno y se ve, segundo a segundo, quién destapa qué casilla, quién recibe el rayo y si el grupo llega a la segura antes
del golpe final. Se trabaja fase a fase y se itera con el grupo: cada mecánica nueva que se descubra en el juego se
añade al motor como opción configurable.

## La mecánica, tal como la modela el motor

- Tablero de 6×6 (configurable), Ludra arriba; esquinas 1 (arriba a la izquierda), 2 (arriba a la derecha),
  3 (abajo a la izquierda) y 4 (abajo a la derecha), como en las marcas del juego.
- Una casilla es la segura y no se ve. En cada tanda se marca la casilla donde está cada jugador y después cae el rayo
  en las marcadas. Hay que salir de la casilla al menos 1 s antes del impacto; si no es la segura, quien está dentro
  muere o se le marca (opción). El rayo que cae en la segura la destapa y el grupo va hacia ella.
- Golpe final: muere quien no esté en la segura.
- Peligros aparte: orbes de energía a los lados que explotan, y el rayo que Ludra lanza de una esquina a la opuesta
  (esquina al azar). En la segunda Prueba hay además anillos que saltar (aún no modelados).

Tiempos por defecto, de `db/aion.duckdb` (117 Pruebas, consulta del 18/11/2026):

| | Primera (1803010) | Segunda (1803040) |
|---|---|---|
| Rayos (1803012), s desde el casteo | 5, 9, 13, 16-17 | 11, 14-15, 18, 22 |
| Golpe final (1803011) | 20 s, ~140 000 de daño | sin registro claro (26 s por defecto) |

Cuándo sale la marca no lo dice el registro (2,5 s antes del impacto por defecto). Que 1803110 (barra de 1,5 s, hacia
los 10 s, 56 muertes) sea el rayo de esquina y 1803203 (hacia los 16 s, 75 muertes) los orbes es una deducción sin
confirmar. Velocidad por defecto: 2 casillas por segundo. Todo está en `PRESETS` y es configurable.

## Fases

1. **Motor** (hecho): `lib/simulador/ludra.ts`, puro. `simular` (fotogramas y eventos de un escenario), `probarTodas`
   (el plan contra las 36 casillas segura y, si la esquina es al azar, las 4 esquinas), `cobertura` (qué casilla
   destapa cada tanda y qué huecos deja). Pruebas: `tests/unit/simulador-ludra.test.ts`.
2. **Pestaña «Simulador»** en la ficha de Ludra de la guía: tablero en SVG, arrastrar jugadores, rutas casilla a
   casilla, reproducir con reloj, «Otra vez» con otra segura y el resultado de «Probar las 36» como mapa de calor.
   Jugadores escritos a mano. Ajustes de la configuración en un panel plegado.
3. **Jugadores desde una captura**: la ventana de party del propio juego (dos columnas de 5, nombre y [servidor]) o la
   de Questlog. OCR en el navegador, cargado solo al usarlo; cada nombre se cruza con los jugadores del grupo para
   poner la clase, y se corrige a mano.
4. **Compartir y en inglés**: el plan (y la configuración si cambia) dentro del enlace; textos en `en.json`.

Después, según lo que vaya viendo el grupo: anillos de la segunda Prueba, reacciones automáticas a los peligros,
guardar planes por grupo.
