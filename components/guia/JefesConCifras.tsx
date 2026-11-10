// Lista de jefes de una raid con las cifras públicas (lee la base: va dentro de <Suspense>, con ListaJefes sin cifras
// de respaldo). Cada jefe suma sus npc de todos los modos de la raid.
import { cifrasPublicas } from '@/lib/guia/cifras';
import { npcsDelJefe, type RaidGuia } from '@/lib/guia/contenido';
import type { Idioma, Traductor } from '@/lib/i18n';
import { ListaJefes } from './Piezas';

export default async function JefesConCifras({ t, idioma, raid }: { t: Traductor; idioma: Idioma; raid: RaidGuia }) {
  const jefes = raid.es.jefes;
  const cifras = await cifrasPublicas(Object.fromEntries(jefes.map((n) => [String(n), npcsDelJefe(raid, n)])));
  return <ListaJefes t={t} idioma={idioma} raid={raid.es.id} jefes={jefes} cifras={cifras} />;
}
