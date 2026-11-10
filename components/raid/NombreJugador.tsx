// Nombre de un jugador en las secciones de la raid: enlace a su ficha (pestaña «Jugadores», por el #hash que lee
// lib/legado/raid.ts). `data-jugador` sirve para resaltarlo en toda la página con el selector «Soy…» (docs/plan-ui.md, fase 4).
export default function NombreJugador({ n }: { n: string }) {
  return <a className="rx-jug" data-jugador={n} href={`#${encodeURIComponent(n)}`}>{n}</a>;
}
