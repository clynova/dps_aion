'use client';
// Botón de la pestaña «Sin filtro» cuando la raid aún no la tiene: la pide, consulta cada 15 s y recarga al terminar.
import { useEffect, useState } from 'react';

type Props = { url: string; t: { boton: string; enCurso: string; error: string } };

export default function BotonToxico({ url, t }: Props) {
  const [estado, setEstado] = useState<'listo' | 'en-curso' | 'error'>('listo');

  useEffect(() => {
    if (estado !== 'en-curso') return;
    let vueltas = 0;
    const id = setInterval(async () => {
      // Unos 5 minutos como mucho (lo que dura la función)
      if (++vueltas > 22) { clearInterval(id); setEstado('error'); return; }
      const r = await fetch(url, { cache: 'no-store' }).catch(() => null);
      if (!r?.ok) return;
      if (((await r.json()) as { hecho?: boolean }).hecho) { clearInterval(id); window.location.reload(); }
    }, 15_000);
    return () => clearInterval(id);
  }, [estado, url]);

  async function pedir() {
    setEstado('en-curso');
    const r = await fetch(url, { method: 'POST' }).catch(() => null);
    if (r?.status === 409) window.location.reload();
    else if (r?.status !== 202) setEstado('error');
  }

  return (
    <p className="cx-fila" aria-live="polite">
      {estado !== 'en-curso' ? <button type="button" className="cx-boton cx-boton-peligro" onClick={pedir}>{t.boton}</button> : <span className="rx-note">{t.enCurso}</span>}
      {estado === 'error' ? <span className="cx-error" role="alert">{t.error}</span> : null}
    </p>
  );
}
