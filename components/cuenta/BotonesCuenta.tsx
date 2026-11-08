'use client';
// Entrar y salir con Discord (Better Auth en el navegador). Al entrar se vuelve a la misma página.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authCliente } from '@/lib/auth/cliente';

export function BotonEntrar({ texto, className = 'cx-boton cx-boton-discord' }: { texto: string; className?: string }) {
  const [enCurso, setEnCurso] = useState(false);
  return (
    <button type="button" className={className} disabled={enCurso} aria-busy={enCurso}
      onClick={async () => {
        setEnCurso(true);
        const vuelta = window.location.pathname + window.location.search;
        const r = await authCliente.signIn.social({ provider: 'discord', callbackURL: vuelta });
        if (r?.error) setEnCurso(false);
      }}>
      {texto}
    </button>
  );
}

export function BotonSalir({ texto }: { texto: string }) {
  const router = useRouter();
  return (
    <button type="button" className="cx-enlace"
      onClick={async () => { await authCliente.signOut(); router.refresh(); }}>
      {texto}
    </button>
  );
}
