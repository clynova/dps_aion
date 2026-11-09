'use client';
// Botón «Analizar con IA» de la página de una raid (publicador o más). Pide el análisis, espera a que termine
// (consulta el estado cada 15 s) y recarga la página para mostrarlo. Respeta la espera de 24 h entre análisis.
import { useEffect, useState } from 'react';
import type { EstadoIA } from '@/lib/analisis/ia';

type Textos = { boton: string; enCurso: string; espera: string; listo: string; error: string; confirmar: string };
type Props = { url: string; inicial: EstadoIA; locale: string; tieneAnalisis: boolean; t: Textos };

export default function BotonAnalizarIA({ url, inicial, locale, tieneAnalisis, t }: Props) {
  const [estado, setEstado] = useState<EstadoIA>(inicial);
  const [fallo, setFallo] = useState('');
  const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale, { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : '');

  useEffect(() => {
    if (estado.estado !== 'en-curso') return;
    const id = setInterval(async () => {
      const r = await fetch(url, { cache: 'no-store' }).catch(() => null);
      if (!r?.ok) return;
      const e = (await r.json()) as EstadoIA;
      if (e.estado === 'listo') { clearInterval(id); window.location.reload(); }
      else if (e.estado !== 'en-curso') { clearInterval(id); setEstado(e); setFallo(t.error); }
    }, 15_000);
    return () => clearInterval(id);
  }, [estado.estado, url, t.error]);

  async function pedir() {
    if (tieneAnalisis && !window.confirm(t.confirmar)) return;
    setFallo('');
    const r = await fetch(url, { method: 'POST' }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { disponible?: string | null };
    if (r?.status === 202) setEstado({ estado: 'en-curso', disponible: null });
    else if (r?.status === 429) setEstado({ estado: 'espera', disponible: d.disponible ?? null });
    else setFallo(t.error);
  }

  return (
    <p className="cx-fila" aria-live="polite">
      {estado.estado === 'disponible' ? <button type="button" className="cx-boton cx-boton-sec" onClick={pedir}>{t.boton}</button> : null}
      {estado.estado === 'en-curso' ? <span className="rx-note">{t.enCurso}</span> : null}
      {estado.estado === 'espera' || estado.estado === 'listo'
        ? <span className="rx-note">{(estado.estado === 'listo' ? t.listo : t.espera).replace('{d}', fecha(estado.disponible))}</span> : null}
      {fallo ? <span className="cx-error" role="alert">{fallo}</span> : null}
    </p>
  );
}
