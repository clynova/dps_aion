'use client';
// Pestañas de la ficha de un jefe (módulo «Raids»): los paneles llegan del servidor con su id y data-pestana; aquí solo
// se muestra uno y se recuerda en el #hash. Un #id de dentro de un panel (p. ej. #m-prueba, una mecánica) abre su panel.
import { useEffect, useState } from 'react';

export default function Pestanas({ ids, etiquetas, aria }: { ids: string[]; etiquetas: Record<string, string>; aria: string }) {
  const [activa, setActiva] = useState(ids[0]);

  useEffect(() => {
    const leer = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      if (!h) return setActiva(ids[0]);
      if (ids.includes(h)) return setActiva(h);
      const panel = document.getElementById(h)?.closest('[data-pestana]')?.getAttribute('data-pestana');
      if (panel && ids.includes(panel)) {
        setActiva(panel);
        requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView());
      }
    };
    leer();
    addEventListener('hashchange', leer);
    return () => removeEventListener('hashchange', leer);
  }, [ids]);

  useEffect(() => {
    for (const id of ids) { const el = document.getElementById(id); if (el) el.hidden = id !== activa; }
  }, [activa, ids]);

  return (
    <nav className="pl-tabs rx-tabs" role="tablist" aria-label={aria}>
      {ids.map((id) => (
        <button key={id} type="button" role="tab" aria-controls={id} aria-selected={id === activa} tabIndex={id === activa ? 0 : -1}
          onClick={() => { history.replaceState(null, '', `#${id}`); setActiva(id); }}>
          {etiquetas[id]}
        </button>
      ))}
    </nav>
  );
}
