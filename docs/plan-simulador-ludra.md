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
  (esquina al azar). Van apagados por defecto (`PELIGROS`, se activan en Ajustes) porque sus tiempos y zonas son
  supuestos: con ellos, los orbes caen en plena 4.ª tanda y deciden el resultado de cualquier plan. En la segunda
  Prueba hay además anillos que saltar (aún no modelados).
- Con `esquivar` (por defecto), los jugadores reaccionan a lo que ven: se apartan de un orbe o del rayo de esquina
  (tras la reacción) y vuelven a lo suyo, no entran en su zona mientras se ve venir, no entran en una casilla marcada si
  no les da tiempo a cruzarla antes del rayo y, si la suya también está marcada, se apartan a la vecina libre más cerca
  de adonde van. Sin esas reglas, el plan de ejemplo perdía 6 de 36 casos por gente que cruzaba casillas marcadas de
  camino a la segura.

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
2. **Pestaña «Simulador»** (hecho) en la ficha de Ludra de la guía: `components/guia/SimuladorLudra.tsx` (cliente;
   textos `sim.*` que le pasa el servidor con `textosConPrefijo`). Planificar (fichas que se arrastran, caminos
   casilla a casilla con la salida de cada parada, la tanda que destapa cada casilla y los huecos), Simular (reloj,
   velocidad, «Otra segura», enseñar la segura, registro de lo que pasa) y Probar las 36 (mapa por casilla y lo que
   mata). Casillas con letra y número (A1–F6). Plan de ejemplo por parejas desde las esquinas: 36 de 36 con los valores
   por defecto. Nombres pegados a mano; plan y ajustes en `localStorage` de cada navegador.
3. **Jugadores desde una captura** (hecho): la ventana de party del propio juego (dos columnas de 5, «nombre[SRV]», o
   solo «nombre» si es del mismo servidor) o la de Questlog («nombre SRV»). `components/guia/LectorCaptura.tsx` con
   tesseract.js 6.0.1 (se carga al usarlo; programa e idioma desde jsDelivr, unos 15 MB la primera vez; la imagen no
   sale del navegador) y `lib/simulador/captura.ts` (puro): luminancia ampliada con interpolación bicúbica (con la
   bilineal del canvas el OCR no lee la letra fina del juego), umbral adaptativo de Bradley y 3 pasadas de OCR
   (`PASADAS`: escala, trazo engrosado y modo de página distintos; ninguna sola los lee todos) que se combinan en
   `extraerJugadores`. Cada nombre se cruza con los jugadores de las raids públicas de Ludra (`conocidos`, de la página)
   para corregirlo y poner la clase. Probado con dos capturas reales (18/11/2026): sin conocidos se marcan 8 de 10 y 7
   de 9; con conocidos, 10 de 10 y 9 de 9. El texto real del OCR, con los nombres cambiados, es
   `tests/fixtures/ocr-party-anonimo.json` (`tests/unit/captura.test.ts`). La lista de jugadores tiene ya clase.
4. **Compartir y en inglés**: el plan (y la configuración si cambia) dentro del enlace; textos en `en.json`.

Después, según lo que vaya viendo el grupo: anillos de la segunda Prueba, reacciones automáticas a los peligros,
guardar planes por grupo.
