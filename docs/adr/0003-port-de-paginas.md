# ADR 0003 · Port de las páginas por adaptador (plantilla en el servidor y código de dibujo original)

Fecha: 8 de noviembre de 2026 · Estado: aceptada (fase 5)

## Contexto

Las páginas de la web estática las dibujan unas 900 líneas de JavaScript imperativo con D3 (`assets/raid.js`, `jugador.js` y `home.js`) sobre plantillas HTML con ids fijos (`assets/*-shell.html`). Llevan meses de ajustes y sus cifras están verificadas. El plan pide que la web nueva las reproduzca **sin diferencias**.

Reescribirlas en componentes React era la opción «de manual», pero habría que volver a verificar cada gráfica, tooltip y redondeo, con riesgo de cambiar cifras sin querer.

## Decisión

Port **por adaptador**, en dos partes:

1. **Plantilla en el servidor.** Cada `*-shell.html` pasa a un componente JSX (`components/raid/PlantillaRaid.tsx`, `components/jugador/PlantillaPerfil.tsx`, generados con un conversor; `components/grupo/PlantillaGrupo.tsx`, escrito a mano). Conserva la misma estructura e ids, con los textos ya traducidos desde el servidor (`t('clave')` en vez de `data-i18n`).
2. **Código de dibujo original en el cliente.** `lib/legado/raid.ts`, `perfil.ts` y `grupo.ts` son el mismo código, generado desde `assets/*.js` con un script de reemplazos exactos (3, 3 y 9 cambios). Ya no piden nada con `fetch`: reciben los datos como parámetros, que salen de la base con el formato del `data.json` (`lib/raids/vista.ts`). D3 se importa como dependencia (7.9.2) en vez de cargarse desde un CDN. `components/legado/Montar.tsx` los monta una vez tras hidratar la página y los desmonta al salir (detectores de cambio de tamaño y del `#hash`).

Los enlaces usan las rutas nuevas (`/g/<grupo>/raids/<slug>`, `/jugadores/<slug>`, con `/en` en inglés). Las URL antiguas `/raids/<slug>/` llevan con un **308** a su grupo mediante un *route handler*. Si fuera una página, al haber streaming ya se habría enviado un 200 antes de redirigir.

## Comprobación

`npm run comparar-paginas` abre la web estática y la nueva en Chromium sin ventana (Playwright) y compara, zona por zona, el texto visible: tiles, tablas, etiquetas de las gráficas, ficha abierta, las 6 pestañas del perfil y la lista del grupo. Con las 5 raids, los 10 perfiles y el grupo, en español e inglés (32 páginas), **todas las zonas son iguales**. La única tolerancia son los nombres de las causas empatadas en el top 8 de los perfiles (ver fase 4); sus cifras por puesto sí se exigen iguales.

Esa comparación encontró además un fallo de la **web publicada**: 6 apodos con las tildes corrompidas («MaldiciÃ³n»), que se corrigió en `main` (`04a4770`).

## Consecuencias

- Mismas cifras y mismas gráficas, ya verificadas, desde el primer día.
- El código de `lib/legado` lleva `@ts-nocheck` y queda fuera de ESLint: es JavaScript de la web estática. Se puede ir pasando a componentes React **por partes**, con `comparar-paginas` como red de seguridad (mientras la web estática siga publicada) y la paridad de datos como prueba permanente.
- Cada página se calcula en cada visita (reconstruir las raids y el perfil). Con pocos grupos va sobrado; cuando haga falta, se cachea con `use cache` y etiquetas por raid y grupo, que la ingesta invalidaría.
- `notFound()` dentro de `<Suspense>` muestra la página 404, pero con estado 200 (el streaming ya empezó). Para una raid privada no importa; si importara para buscadores, se resolvería antes del `<Suspense>`.
