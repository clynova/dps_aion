// Botones ES | EN. Son enlaces relativos «?lang=…»: el navegador conserva la ruta actual y proxy.ts guarda la
// elección en una cookie y redirige a la ruta del idioma. Sin JavaScript y sin leer la ruta en el servidor, así
// que no impide prerenderizar ninguna página.
import { IDIOMAS, type Idioma } from '@/lib/i18n';

export default function SelectorIdioma({ actual, etiqueta }: { actual: Idioma; etiqueta: string }) {
  return (
    <div className="rx-lang" role="group" aria-label={etiqueta}>
      {IDIOMAS.map((i) => (
        <a key={i} href={`?lang=${i}`} lang={i} hrefLang={i} rel="nofollow" aria-current={i === actual ? 'true' : undefined}>
          {i.toUpperCase()}
        </a>
      ))}
    </div>
  );
}
