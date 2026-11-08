'use client';
// Muestra el enlace completo de una invitación (con el origen de la página) y lo copia al portapapeles.
import { useEffect, useState } from 'react';

export default function CopiarEnlace({ ruta, texto, copiado }: { ruta: string; texto: string; copiado: string }) {
  const [url, setUrl] = useState(ruta);
  const [ok, setOk] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- el origen solo se conoce en el navegador
  useEffect(() => { setUrl(window.location.origin + ruta); }, [ruta]);
  return (
    <span className="cx-fila">
      <span className="cx-codigo">{url}</span>
      <button type="button" className="cx-boton cx-boton-sec"
        onClick={async () => { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 1500); }}>
        {ok ? copiado : texto}
      </button>
    </span>
  );
}
