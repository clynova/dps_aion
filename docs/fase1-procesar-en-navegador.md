# Fase 1 · Prueba de concepto: procesar Questlog en el navegador

> Resultado del 8 de noviembre de 2026 · Rama `refactor/next` · Código en `prototipos/procesar-navegador/`
>
> Pregunta: ¿puede el navegador de cualquier miembro de un grupo ejecutar los mismos `db/*.sql` que usa el PC y obtener **exactamente** el mismo `data.json`? (Plan, apartado 4, fase 1.)

## Veredicto

**Sí. Se cumplen los criterios de la fase 1.** Las 11 runs con jefe que había en Questlog dan en el navegador el mismo JSON que DuckDB nativo, y cada una tarda alrededor de 1 s. La arquitectura del plan (cálculo en el cliente y validación en el servidor) sigue adelante. Los planes B y C no hacen falta por ahora.

Con una salvedad: **todavía no hay en Questlog ninguna raid de 8 o más jugadores** (el equipo se formateó y desde entonces solo hay mazmorras de 5). Hay que repetir la prueba con la primera raid real (apartado «Pendiente»).

## Qué se probó

`prototipos/procesar-navegador/` es una página estática con un módulo JS que imita `tools/cargar-db.ps1` y `tools/extraer-raid.ps1`:

1. Carga **DuckDB-WASM 1.32.0** (lleva DuckDB **v1.4.3**; en el PC tenemos la 1.5.6) desde jsDelivr. DuckDB corre en su propio Web Worker.
2. Lee **sin cambios** del repo `db/esquema.sql`, `cargar.sql`, `cargar-runs.sql`, `vistas.sql`, `raid.sql` y la parte de nombres de `cargar-web.sql`, más `nombres.json` y `nombres.en.json`.
3. Lee la carpeta de Questlog: con el selector de carpetas (`<input webkitdirectory>`) o, solo para pruebas automáticas, a través del servidor local `servir.ps1`. Carga todas las runs y lista las que tienen jefe, con la misma regla de jefe principal que `extraer-raid.ps1`.
4. Al elegir una run, descomprime sus `.json.gz` con `DecompressionStream`, ejecuta `cargar.sql`, inserta la raid y ejecuta `raid.sql` con las mismas variables (`slug`, `jefe`, `fecha`).
5. Guarda el JSON y se compara con el que produce DuckDB nativo sobre la base local con las mismas variables (`tools/comparar-json.ps1 -Ignorar meta.extraido`, sin relajar el orden de las listas).

## Resultados

**Equivalencia (11 de 11 runs iguales)**

| Run | Encuentros | JSON | Nativo frente a navegador |
|---|---|---|---|
| 00ae175a | 3 | 19,3 KB | Iguales |
| d0633ea4 | 4 | 24,3 KB | Iguales |
| b2a43637 | 4 | 9,8 KB | Iguales |
| 920340e5 | 4 | 20,4 KB | Iguales |
| 894e2ac3 | 4 | 20,2 KB | Iguales |
| a381ad44 | 3 | 21,0 KB | Iguales |
| 9939fe75 | 5 | 22,0 KB | Iguales |
| 5e19cdcb | 3 | 15,8 KB | Iguales |
| c43a1617 | 3 | 15,1 KB | Iguales |
| a4a428a6 | 5 | 24,7 KB | Iguales |
| e8e3d25d | 3 | 20,7 KB | Iguales |

La única diferencia de bytes es el **orden de los jugadores dentro de `detalle`**, que es un objeto JSON sin orden definido. El contenido es idéntico.

**Rendimiento** (navegador integrado de Claude, Chromium, en el PC del usuario)

| Paso | Tiempo |
|---|---|
| Arrancar DuckDB-WASM y cargar esquema y nombres | 2,5 s (la primera vez; después, desde la caché del navegador) |
| Leer las 12 runs | 1,4 s |
| Procesar una run de 3–5 encuentros (descomprimir + `cargar.sql` + `raid.sql`) | 0,6–1,2 s |
| Las 11 runs seguidas (44 encuentros, 2,6 MB `.gz`) | unos 7–12 s en total |
| `raid.sql` nativo, para comparar | 0,5–0,8 s |

**Recursos**

| Recurso | Medida |
|---|---|
| Descarga de DuckDB-WASM (`duckdb-eh.wasm`, comprimido brotli) | 6,8 MB, una vez, y queda en caché |
| Extensión JSON (de extensions.duckdb.org) | 0,19 MB |
| Memoria de DuckDB con 41 encuentros (65.323 golpes) cargados | 107 MB |

Una noche de raid de Rahu tenía unos 17–18 intentos, un volumen parecido al de los 41 encuentros de la prueba. Por eso es razonable esperar **menos de 10 s y unos 100–150 MB** por raid, muy por debajo del límite de 30 s del plan. Es una **estimación**: está pendiente medirlo con una raid real.

## Lo que esto cambia en el plan

1. **Procesar una sola run a la vez.** Al lanzar una segunda run antes de que acabara la primera, compartieron conexión y variables de DuckDB (`set variable slug…`), y la primera salió con datos de la segunda. En el producto, el asistente bloquea la selección mientras procesa, o usa una conexión o base nueva por run.
2. **Una sola fuente para las reglas de selección.** La regla de jefe principal (más intentos de más de 5 s y, en empate, el último) estaba duplicada en PowerShell y la primera versión en JS la hizo mal. Hay que llevarla a SQL (por ejemplo, `db/runs.sql`) para que la usen el PC y el navegador.
3. **DuckDB-WASM solo en la página de subida.** Son 6,8 MB, así que se carga bajo demanda en `/g/[grupo]/subir` y nunca en las páginas de lectura.
4. **Dependencias externas en tiempo de ejecución.** Ahora mismo la extensión JSON se descarga de extensions.duckdb.org y el motor de jsDelivr. Para el producto: fijar las versiones exactas y, a ser posible, **servir el `.wasm` y la extensión desde nuestro dominio**, para no depender de terceros ni de su disponibilidad.
5. **Versión de DuckDB.** El navegador va con 1.4.3 y el PC con 1.5.6, y nuestro SQL da lo mismo en ambas. Aun así, el CI debe comprobar la equivalencia con un fixture cada vez que cambie `db/*.sql` o alguna de las dos versiones (ya está en el plan, apartado 5).
6. **Solo escritorio.** El selector de carpetas existe en Chrome, Edge y Firefox de escritorio. En el móvil no hay carpeta de Questlog, así que no es una limitación real.

## Pendiente antes de dar la fase 1 por cerrada del todo

- [ ] Repetir con **la primera raid real** (8 o más jugadores): tiempos, memoria y equivalencia.
- [ ] Probar **el selector de carpetas a mano** (lo hace el usuario: elegir `%APPDATA%\Questlog\aion-2`) en Chrome o Edge y en Firefox.
- [ ] Probar en un **PC modesto**, como el de algún miembro del grupo.

## Cómo repetir la prueba

```
powershell -ExecutionPolicy Bypass -File prototipos\procesar-navegador\servir.ps1 -Salida C:\ruta\salida
```

1. Abrir `http://localhost:8766/prototipos/procesar-navegador/`.
2. Elegir la carpeta de Questlog (o pulsar «Leer Questlog desde el servidor»).
3. Pulsar una run. El JSON y los tiempos se guardan en `-Salida` como `<run>-navegador.json` y `<run>-meta.json`.

Para comparar con el nativo: generar con `db/raid.sql` sobre `db/aion.duckdb` con las variables de `<run>-meta.json` (slug, jefe, fecha) y ejecutar `tools/comparar-json.ps1 nativo.json navegador.json -Ignorar meta.extraido`.
