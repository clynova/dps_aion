'use client';
// Crear un grupo: propone la dirección a partir del nombre hasta que la persona la cambie a mano.
import { useState } from 'react';
import Formulario from '@/components/Formulario';
import { accionCrearGrupo } from '@/lib/acciones/grupos';
import { slugDesdeNombre } from '@/lib/permisos';

type T = { nombre: string; slug: string; ayuda: string; boton: string };

export default function FormCrearGrupo({ lang, t, errores }: { lang: string; t: T; errores: Record<string, string> }) {
  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [tocado, setTocado] = useState(false);
  return (
    <Formulario accion={accionCrearGrupo} campos={{ lang }} textos={errores}>
      <div className="cx-campo">
        <label htmlFor="g-nombre">{t.nombre}</label>
        <input id="g-nombre" name="nombre" className="cx-input" required minLength={2} maxLength={60} autoComplete="off" value={nombre}
          onChange={(e) => { setNombre(e.target.value); if (!tocado) setSlug(slugDesdeNombre(e.target.value)); }} />
      </div>
      <div className="cx-campo">
        <label htmlFor="g-slug">{t.slug}</label>
        <input id="g-slug" name="slug" className="cx-input" required minLength={3} maxLength={40} pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
          autoComplete="off" spellCheck={false} value={slug} aria-describedby="g-slug-ayuda"
          onChange={(e) => { setTocado(true); setSlug(e.target.value.toLowerCase()); }} />
        <p className="rx-note" id="g-slug-ayuda">{t.ayuda}</p>
      </div>
      <div><button type="submit" className="cx-boton">{t.boton}</button></div>
    </Formulario>
  );
}
