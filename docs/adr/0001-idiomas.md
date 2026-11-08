# ADR 0001 · Idiomas sin librería: `app/[lang]`, `proxy.ts` y diccionario plano

Fecha: 8 de noviembre de 2026 · Estado: aceptada (fase 2)

## Contexto

El plan proponía next-intl. Al hacer el esqueleto se vio que:

- Los 312 textos de la web actual (`assets/i18n.js`) usan **claves con puntos que se solapan**: por ejemplo `pl.chart.dps` y `pl.chart.dps.note`. next-intl interpreta los puntos como niveles de anidación, así que una clave no puede ser a la vez un texto y un grupo. Usarla obligaría a renombrar decenas de claves y a tocar todo el código que se porta.
- Next.js 16 documenta un patrón nativo (`node_modules/next/dist/docs/01-app/02-guides/internationalization.md`): segmento `app/[lang]`, `proxy.ts` (el antiguo middleware) para elegir idioma y diccionarios propios. Con `next/root-params` cualquier Server Component lee el idioma sin pasarlo por props.

## Decisión

- **Rutas:** `app/[lang]/…` con `generateStaticParams` para `es` y `en`. El español **no lleva prefijo** en la URL pública: `proxy.ts` reescribe `/x` → `/es/x` por dentro. El inglés va en `/en/x`. Si alguien entra a `/es/x`, se le redirige a `/x`.
- **Elección de idioma** (`lib/i18n/ruta-idioma.ts`, función pura con pruebas): `?lang=` de los enlaces antiguos (guarda una cookie `lang` y redirige sin el parámetro) > cookie > navegador (si no está en español → inglés, como la web actual) > español.
- **Textos:** `lib/i18n/es.json` y `en.json`, planos, generados desde `assets/i18n.js` con `npm run textos` mientras la web estática siga viva. El traductor (`traductor(idioma)(clave, vars)`) interpola `{var}` y, si falta un texto, usa el español y después la propia clave, exactamente como `I18N.t()`.
- **Selector ES | EN:** son enlaces `?lang=…`, que funcionan sin JavaScript.

## Consecuencias

- No hay que renombrar ninguna clave, y el código de `raid.js` y `jugador.js` se porta con `t('clave', {…})` igual que hoy.
- Una dependencia menos. Si algún día hacen falta plurales ICU o más idiomas, se puede adoptar una librería renombrando las claves solapadas en ese momento.
- Las pruebas (`tests/unit/i18n.test.ts`) comprueban que es y en tienen las mismas claves y las mismas variables, y cubren todas las decisiones del proxy.
