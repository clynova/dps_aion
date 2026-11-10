'use client';
// Contenedor de un gráfico SVG del servidor (página del jefe): el SVG se escala con su viewBox, así que su texto
// salía enorme en escritorio y diminuto en el móvil. Aquí se mide el ancho real y se pone `--k` = ancho del viewBox
// / ancho en pantalla, que styles/base.css usa para que el texto se vea siempre a 11 px (en el móvil, algo menos:
// `k` se limita para que no se monten las etiquetas). Sin JavaScript se ve como antes.
import { useEffect, useRef, type ReactNode } from 'react';

export default function GraficoAjustado({ ancho, children }: { ancho: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Se mide el SVG, no el contenedor: en el móvil el SVG tiene un ancho mínimo y el contenedor se desplaza
    const medir = () => { const w = el.querySelector('svg')?.getBoundingClientRect().width || el.clientWidth; if (w) el.style.setProperty('--k', String(Math.min(1.8, Math.max(0.5, ancho / w)))); };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ancho]);
  return <div ref={ref} className="rx-chart jx-chart">{children}</div>;
}
