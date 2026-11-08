'use client';
// Formulario conectado a una acción de servidor: muestra el error (ya traducido) o «Guardado».
// El servidor devuelve la clave del error; aquí llegan los textos traducidos en `textos` (los componentes cliente
// no leen el idioma por su cuenta).
import { useActionState, type ReactNode } from 'react';
import type { Resultado } from '@/lib/acciones/grupos';

type Props = {
  accion: (prev: Resultado, f: FormData) => Promise<Resultado>;
  campos: Record<string, string>;           // campos ocultos: lang, grupo, codigo, usuario…
  textos: Record<string, string>;           // clave → texto, para los errores posibles
  guardado?: string;                        // texto de éxito (si no se redirige)
  confirmar?: string;                       // pregunta antes de enviar
  className?: string;
  children: ReactNode;
};

export default function Formulario({ accion, campos, textos, guardado, confirmar, className = 'cx-form', children }: Props) {
  const [estado, enviar, enCurso] = useActionState(accion, null);
  return (
    <form action={enviar} className={className} aria-busy={enCurso}
      onSubmit={(e) => { if (confirmar && !window.confirm(confirmar)) e.preventDefault(); }}>
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <fieldset disabled={enCurso} style={{ display: 'contents' }}>{children}</fieldset>
      {estado?.error ? <p className="cx-error" role="alert">{textos[estado.error] ?? textos['comun.error']}</p> : null}
      {estado?.ok && guardado ? <p className="cx-ok" role="status">{guardado}</p> : null}
    </form>
  );
}
