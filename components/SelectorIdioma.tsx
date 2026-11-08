'use client';
// Botones ES | EN. Son enlaces con ?lang=…: proxy.ts guarda la elección en una cookie y redirige a la ruta del
// idioma, así funciona igual sin JavaScript y con los enlaces antiguos de la web estática.
import { usePathname } from 'next/navigation';
import { IDIOMAS, sinIdioma, type Idioma } from '@/lib/i18n';

export default function SelectorIdioma({ actual, etiqueta }: { actual: Idioma; etiqueta: string }) {
  const ruta = sinIdioma(usePathname() || '/');
  return (
    <div className="rx-lang" role="group" aria-label={etiqueta}>
      {IDIOMAS.map((i) => (
        <a key={i} href={`${ruta}?lang=${i}`} lang={i} hrefLang={i} aria-current={i === actual ? 'true' : undefined}>
          {i.toUpperCase()}
        </a>
      ))}
    </div>
  );
}
