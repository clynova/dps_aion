'use client';
// Crea un token de publicación y lo muestra una sola vez, con botón para copiarlo.
import { useActionState, useState } from 'react';
import { accionCrearToken, type ResultadoToken } from '@/lib/acciones/grupos';

type Props = { campos: Record<string, string>; textos: Record<string, string>; t: { nombre: string; crear: string; nuevo: string; copiar: string; copiado: string } };

export default function CrearToken({ campos, textos, t }: Props) {
  const [estado, enviar, enCurso] = useActionState<ResultadoToken, FormData>(accionCrearToken, null);
  const [ok, setOk] = useState(false);
  return (
    <form action={enviar} className="cx-form" aria-busy={enCurso}>
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="cx-fila">
        <div className="cx-campo">
          <label htmlFor="t-nombre">{t.nombre}</label>
          <input id="t-nombre" name="nombre" className="cx-input" required maxLength={60} disabled={enCurso} />
        </div>
        <button type="submit" className="cx-boton" disabled={enCurso}>{t.crear}</button>
      </div>
      {estado?.error ? <p className="cx-error" role="alert">{textos[estado.error] ?? textos['comun.error']}</p> : null}
      {estado?.token ? (
        <div className="cx-ok" role="status">
          <p>{t.nuevo}</p>
          <span className="cx-fila">
            <span className="cx-codigo" data-token>{estado.token}</span>
            <button type="button" className="cx-boton cx-boton-sec"
              onClick={async () => { await navigator.clipboard.writeText(estado.token!); setOk(true); setTimeout(() => setOk(false), 1500); }}>
              {ok ? t.copiado : t.copiar}
            </button>
          </span>
        </div>
      ) : null}
    </form>
  );
}
