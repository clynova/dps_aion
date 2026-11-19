'use client';
// Jugadores desde una captura de la party (simulador de Ludra, fase 3). La imagen se lee en el navegador con
// tesseract.js (se carga solo al usarlo; el programa y el idioma se descargan de jsDelivr la primera vez) y nunca se
// envía a ningún sitio. Se prepara en código (lib/simulador/captura.ts: prepararImagen), se pasa por las
// PASADAS del OCR y los nombres salen de extraerJugadores, que los cruza con los jugadores conocidos para poner la clase.
import { useEffect, useState } from 'react';
import { extraerJugadores, PASADAS, prepararImagen, preseleccion, type Candidato, type Conocido } from '@/lib/simulador/captura';

/** `propuesto`: marcado de entrada (los demás van plegados en «Otras palabras leídas») */
type Fila = Candidato & { marcado: boolean; propuesto: boolean };
type Estado = { fase: 'inactivo' } | { fase: 'descargando' } | { fase: 'leyendo'; n: number } | { fase: 'listo'; filas: Fila[] } | { fase: 'error' | 'nada' };

const ANCHO_MAX = 3200;   // px del canvas: una captura de pantalla entera se reduce para no tardar una eternidad

async function leer(imagen: ImageBitmap, alPasar: (n: number) => void, alDescargar: () => void): Promise<string[]> {
  const { createWorker, PSM } = await import('tesseract.js');
  alDescargar();
  const worker = await createWorker('eng');
  try {
    // La imagen tal cual (el canvas solo se usa para leer los píxeles: la ampliación es bicúbica, en prepararImagen)
    const origen = document.createElement('canvas');
    origen.width = imagen.width; origen.height = imagen.height;
    const octx = origen.getContext('2d', { willReadFrequently: true })!;
    octx.drawImage(imagen, 0, 0);
    const px = octx.getImageData(0, 0, imagen.width, imagen.height).data;
    const textos: string[] = [];
    for (let i = 0; i < PASADAS.length; i++) {
      alPasar(i + 1);
      await new Promise((r) => setTimeout(r, 0));   // que se pinte el progreso antes del cálculo
      const p = PASADAS[i], escala = Math.min(p.escala, ANCHO_MAX / imagen.width);
      const lista = prepararImagen(px, imagen.width, imagen.height, escala, p.gordo);
      const canvas = document.createElement('canvas');
      canvas.width = lista.w; canvas.height = lista.h;
      canvas.getContext('2d')!.putImageData(new ImageData(lista.rgba, lista.w, lista.h), 0, 0);
      await worker.setParameters({ tessedit_pageseg_mode: p.psm === '3' ? PSM.AUTO : PSM.SPARSE_TEXT, user_defined_dpi: '300' });
      textos.push((await worker.recognize(canvas)).data.text);
    }
    return textos;
  } finally {
    await worker.terminate();
  }
}

export default function LectorCaptura({ conocidos, clases, tr, alUsar }: {
  conocidos: Conocido[];
  /** id de clase → nombre en el idioma de la página */
  clases: [string, string][];
  tr: (k: string, v?: Record<string, string | number>) => string;
  alUsar: (jugadores: { nombre: string; clase: string | null }[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado>({ fase: 'inactivo' });
  const ocupado = estado.fase === 'descargando' || estado.fase === 'leyendo';

  async function procesar(archivo: Blob | null | undefined) {
    if (!archivo || !archivo.type.startsWith('image/') || ocupado) return;
    setEstado({ fase: 'descargando' });
    try {
      const imagen = await createImageBitmap(archivo);
      const textos = await leer(imagen, (n) => setEstado({ fase: 'leyendo', n }), () => setEstado({ fase: 'descargando' }));
      imagen.close();
      const cs = extraerJugadores(textos, conocidos);
      if (!cs.length) return setEstado({ fase: 'nada' });
      const marcas = preseleccion(cs, textos.length);
      setEstado({ fase: 'listo', filas: cs.map((c, i) => ({ ...c, marcado: marcas[i], propuesto: marcas[i] })) });
    } catch {
      setEstado({ fase: 'error' });
    }
  }

  // Pegar una imagen (Ctrl+V) con el lector abierto, esté donde esté el foco dentro de la página
  useEffect(() => {
    if (!abierto) return;
    const pegar = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((x) => x.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      void procesar(item.getAsFile());
    };
    addEventListener('paste', pegar);
    return () => removeEventListener('paste', pegar);
  });

  const cambiar = (i: number, f: (x: Fila) => Fila) => setEstado((e) => (e.fase === 'listo' ? { fase: 'listo', filas: e.filas.map((x, n) => (n === i ? f(x) : x)) } : e));
  const marcadas = estado.fase === 'listo' ? estado.filas.filter((f) => f.marcado && f.nombre.trim()) : [];
  const fila = (f: Fila, i: number) => (
    <li key={i}>
      <input type="checkbox" checked={f.marcado} aria-label={tr('sim.captura.marcar', { j: f.nombre })} onChange={(e) => cambiar(i, (x) => ({ ...x, marcado: e.target.checked }))} />
      <input className="cx-input" value={f.nombre} maxLength={24} aria-label={tr('sim.nombre')} onChange={(e) => cambiar(i, (x) => ({ ...x, nombre: e.target.value, conocido: false }))} />
      <select className="cx-select" value={f.clase ?? ''} aria-label={tr('sim.clase')} onChange={(e) => cambiar(i, (x) => ({ ...x, clase: e.target.value || null }))}>
        <option value="">{tr('sim.clase.ninguna')}</option>
        {clases.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
      </select>
      {f.conocido ? <span className="rx-pill is-ok" title={tr('sim.captura.conocido.t')}>{tr('sim.captura.conocido')}</span> : null}
    </li>
  );
  const otras = estado.fase === 'listo' ? estado.filas.map((f, i) => [f, i] as const).filter(([f]) => !f.propuesto) : [];

  if (!abierto) {
    return <p><button type="button" className="cx-boton cx-boton-sec" onClick={() => setAbierto(true)}>{tr('sim.captura')}</button></p>;
  }
  return (
    <div className="sim-captura">
      <p className="hm-sub">{tr('sim.captura.ayuda')}</p>
      <div className="sim-soltar" aria-busy={ocupado}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void procesar(e.dataTransfer.files[0]); }}>
        <label className="cx-boton cx-boton-sec">
          {tr('sim.captura.elegir')}
          <input type="file" accept="image/*" hidden disabled={ocupado} onChange={(e) => { void procesar(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <span className="hm-sub">{tr('sim.captura.pegar')}</span>
      </div>
      <p className="rx-note" aria-live="polite">
        {estado.fase === 'descargando' ? tr('sim.captura.descargando')
          : estado.fase === 'leyendo' ? tr('sim.captura.leyendo', { n: estado.n, de: PASADAS.length })
            : estado.fase === 'error' ? <span className="cx-error">{tr('sim.captura.error')}</span>
              : estado.fase === 'nada' ? tr('sim.captura.nada') : null}
      </p>
      {estado.fase === 'listo' ? (
        <>
          <p className="hm-sub">{tr('sim.captura.resultado')}</p>
          <ul className="sim-leidos">{estado.filas.map((f, i) => (f.propuesto ? fila(f, i) : null))}</ul>
          {otras.length ? (
            <details>
              <summary className="hm-sub">{tr('sim.captura.otras', { n: otras.length })}</summary>
              <ul className="sim-leidos">{otras.map(([f, i]) => fila(f, i))}</ul>
            </details>
          ) : null}
          <p className="hm-sub">{tr('sim.captura.nota')}</p>
        </>
      ) : null}
      <p className="cx-fila">
        {estado.fase === 'listo' ? (
          <button type="button" className="cx-boton" disabled={!marcadas.length}
            onClick={() => { alUsar(marcadas.map((f) => ({ nombre: f.nombre.trim(), clase: f.clase }))); setEstado({ fase: 'inactivo' }); setAbierto(false); }}>
            {tr('sim.captura.usar', { n: marcadas.length })}
          </button>
        ) : null}
        <button type="button" className="cx-boton cx-boton-sec" disabled={ocupado} onClick={() => { setEstado({ fase: 'inactivo' }); setAbierto(false); }}>{tr('sim.captura.cerrar')}</button>
      </p>
    </div>
  );
}
