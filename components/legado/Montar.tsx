'use client';
// Monta en el navegador los módulos de lib/legado (el código de dibujo de la web estática) sobre la plantilla que ya
// pintó el servidor. Recibe solo datos serializables; las rutas y los textos se construyen aquí con el idioma.
import { useEffect, useRef } from 'react';
import { localeDe, rutaEn, traductor, type Idioma } from '@/lib/i18n';
import { montarGrupo } from '@/lib/legado/grupo';
import { montarPerfil } from '@/lib/legado/perfil';
import { montarRaid } from '@/lib/legado/raid';

type Nombres = { apodos?: Record<string, string>; habilidades?: Record<string, string>; npcs?: Record<string, string>; iconos?: Record<string, string> };
const comun = (idioma: Idioma) => ({ T: traductor(idioma), LANG: idioma, LOC: localeDe(idioma) });

/** Ejecuta `montar` una sola vez (en desarrollo, React repite los efectos: así no se pinta dos veces). */
function useMontar(montar: () => () => void) {
  const hecho = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!hecho.current) hecho.current = montar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se monta una vez; la página entera se remonta si cambia la raid
  }, []);
  useEffect(() => () => { hecho.current?.(); }, []);
}

export function MontarRaid(p: { idioma: Idioma; datos: unknown; analisis: unknown; soloEs: boolean; nombres: Nombres }) {
  useMontar(() => montarRaid({
    D: structuredClone(p.datos), A: p.analisis, N: p.nombres, soloEs: p.soloEs, ...comun(p.idioma),
    rutaPerfil: (slug: string) => rutaEn(p.idioma, `/jugadores/${slug}`),
  }));
  return null;
}

export function MontarPerfil(p: { idioma: Idioma; datos: unknown; perfilClaude: unknown; nombres: Nombres; indice: unknown[]; grupoDeRaid: Record<string, string> }) {
  useMontar(() => montarPerfil({
    D: structuredClone(p.datos), P: p.perfilClaude, N: p.nombres, IDX: p.indice, ...comun(p.idioma),
    rutaRaid: (slug: string) => rutaEn(p.idioma, `/g/${p.grupoDeRaid[slug]}/raids/${slug}`),
  }));
  return null;
}

export function MontarGrupo(p: { idioma: Idioma; grupo: string; raids: unknown[]; jugadores: unknown[]; nombres: Nombres; conSolicitud: boolean }) {
  useMontar(() => montarGrupo({
    raids: structuredClone(p.raids), jugadores: p.jugadores, N: p.nombres, ...comun(p.idioma),
    rutaRaid: (slug: string) => rutaEn(p.idioma, `/g/${p.grupo}/raids/${slug}`),
    rutaJugador: (slug: string) => rutaEn(p.idioma, `/jugadores/${slug}`),
    conSolicitud: p.conSolicitud,
    rutaSolicitar: (slug: string) => `/api/v1/grupos/${p.grupo}/jugadores/${slug}/solicitar`,
  }));
  return null;
}
