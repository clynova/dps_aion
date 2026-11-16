'use client';
// Botón de la pestaña «Sin filtro»: la hace si falta o la rehace (una vez por hora). La pide, consulta cada 15 s hasta
// que cambia la fecha de la que hay y recarga la página.
import { useEffect, useState } from 'react';

type Props = {
  url: string; locale: string;
  /** Fecha de la que hay (ISO), o null si todavía no hay ninguna */
  actualizado: string | null;
  t: { boton: string; rehacer: string; confirmar: string; enCurso: string; espera: string; error: string };
};

export default function BotonToxico({ url, locale, actualizado, t }: Props) {
  const [estado, setEstado] = useState<'listo' | 'en-curso' | 'error'>('listo');
  const [espera, setEspera] = useState<string | null>(null);

  useEffect(() => {
    if (estado !== 'en-curso') return;
    let vueltas = 0;
    const id = setInterval(async () => {
      // Unos 5 minutos como mucho (lo que dura la función)
      if (++vueltas > 22) { clearInterval(id); setEstado('error'); return; }
      const r = await fetch(url, { cache: 'no-store' }).catch(() => null);
      if (!r?.ok) return;
      const d = (await r.json()) as { actualizado?: string | null };
      if (d.actualizado && d.actualizado !== actualizado) { clearInterval(id); window.location.reload(); }
    }, 15_000);
    return () => clearInterval(id);
  }, [estado, url, actualizado]);

  async function pedir() {
    if (actualizado && !window.confirm(t.confirmar)) return;
    setEspera(null);
    setEstado('en-curso');
    const r = await fetch(url, { method: 'POST' }).catch(() => null);
    if (r?.status === 202) return;
    const d = (await r?.json().catch(() => ({}))) as { disponible?: string };
    if (r?.status === 429 && d.disponible) { setEstado('listo'); setEspera(new Date(d.disponible).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })); }
    else setEstado('error');
  }

  return (
    <p className="cx-fila" aria-live="polite">
      {estado !== 'en-curso'
        ? <button type="button" className={`cx-boton ${actualizado ? 'cx-boton-sec' : 'cx-boton-peligro'}`} onClick={pedir}>{actualizado ? t.rehacer : t.boton}</button>
        : <span className="rx-note">{t.enCurso}</span>}
      {espera ? <span className="rx-note">{t.espera.replace('{h}', espera)}</span> : null}
      {estado === 'error' ? <span className="cx-error" role="alert">{t.error}</span> : null}
    </p>
  );
}
