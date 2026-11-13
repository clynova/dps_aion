// Infografías del módulo «Raids» (fase 6): esquemas propios en SVG de las mecánicas que hacen wipe, dibujados a partir
// de lo que describen las guías (versión anterior) y, en el tablero de Ludra, con los tiempos de nuestros registros.
// No son capturas del juego ni calcan ninguna imagen. Salen del servidor con los colores del tema (styles/base.css,
// prefijo gx-ig-); el texto va en lib/i18n (guias.ig.*).
import type { ReactNode } from 'react';
import type { IdInfografia } from '@/lib/guia/infografias';
import type { Clave, Traductor } from '@/lib/i18n';

type Props = { t: Traductor };
const W = 360;

/** Texto en varias líneas (cortadas a mano en el diccionario con «|»). */
function Lineas({ x, y, texto, ancla = 'start', clase = 'gx-ig-t' }: { x: number; y: number; texto: string; ancla?: 'start' | 'middle' | 'end'; clase?: string }) {
  return (
    <text x={x} y={y} textAnchor={ancla} className={clase}>
      {texto.split('|').map((l, i) => <tspan key={i} x={x} dy={i ? '1.2em' : 0}>{l.trim()}</tspan>)}
    </text>
  );
}

const Jugador = ({ x, y, clase = '' }: { x: number; y: number; clase?: string }) => <circle cx={x} cy={y} r={4.5} className={`gx-ig-jug ${clase}`} />;

/** Ludra: la Prueba (tablero de casillas, una sola segura) y la rotura de después. */
function LudraTablero({ t }: Props) {
  const c = 22, x0 = 150, y0 = 40, n = 6;
  const destapadas = [[0, 0], [0, 1], [1, 0], [0, 5], [1, 5], [5, 0], [5, 5], [4, 5], [2, 0], [5, 1]];
  const segura = [3, 2];
  const celda = (f: number, k: number) => ({ x: x0 + k * c, y: y0 + f * c });
  return (
    <svg viewBox={`0 0 ${W} 250`} role="img" aria-label={t('guias.ig.ludra-tablero.alt')}>
      <rect x={x0 + 26} y={8} width={80} height={20} rx={4} className="gx-ig-jefe" />
      <text x={x0 + 66} y={22} textAnchor="middle" className="gx-ig-t gx-ig-sobre-jefe">{t('guias.ig.ludra')}</text>
      {Array.from({ length: n * n }, (_, i) => {
        const f = Math.floor(i / n), k = i % n, { x, y } = celda(f, k);
        const esSegura = f === segura[0] && k === segura[1];
        const destapada = destapadas.some(([a, b]) => a === f && b === k);
        return (
          <g key={i}>
            <rect x={x} y={y} width={c} height={c} className={esSegura ? 'gx-ig-segura' : destapada ? 'gx-ig-destapada' : 'gx-ig-casilla'} />
            {destapada ? <path d={`M${x + 7},${y + 7}L${x + c - 7},${y + c - 7}M${x + c - 7},${y + 7}L${x + 7},${y + c - 7}`} className="gx-ig-x" /> : null}
          </g>
        );
      })}
      {/* Parejas en cada esquina, recorriendo el borde en el sentido del reloj */}
      {[[x0 - 9, y0 - 2], [x0 + n * c + 9, y0 - 2], [x0 + n * c + 9, y0 + n * c + 2], [x0 - 9, y0 + n * c + 2]].map(([x, y], i) => (
        <g key={i}><Jugador x={x} y={y - 4} /><Jugador x={x} y={y + 6} /></g>
      ))}
      <path d={`M${x0 + 8},${y0 - 6}H${x0 + n * c - 14}`} className="gx-ig-flecha" markerEnd="url(#gx-ig-punta)" />
      <path d={`M${x0 + n * c + 4},${y0 + 10}V${y0 + n * c - 18}`} className="gx-ig-flecha" markerEnd="url(#gx-ig-punta)" />
      {/* Leyenda */}
      <rect x={6} y={48} width={12} height={12} className="gx-ig-segura" />
      <Lineas x={24} y={58} texto={t('guias.ig.ludra-tablero.segura')} />
      <rect x={6} y={88} width={12} height={12} className="gx-ig-destapada" />
      <Lineas x={24} y={98} texto={t('guias.ig.ludra-tablero.destapada')} />
      <Jugador x={12} y={134} />
      <Lineas x={24} y={138} texto={t('guias.ig.ludra-tablero.parejas')} />
      {/* Línea de tiempo (nuestros registros), 10 px por segundo: casteo → a la casilla (~15 s) → rotura de 10 s desde el ~20 */}
      <line x1={10} x2={350} y1={222} y2={222} className="gx-ig-eje" />
      <rect x={10} y={214} width={150} height={16} rx={3} className="gx-ig-tramo" />
      <rect x={210} y={214} width={100} height={16} rx={3} className="gx-ig-rotura" />
      <text x={85} y={226} textAnchor="middle" className="gx-ig-t gx-ig-claro">{t('guias.ig.ludra-tablero.buscar')}</text>
      <text x={260} y={226} textAnchor="middle" className="gx-ig-t gx-ig-claro">{t('guias.ig.ludra-tablero.rotura')}</text>
      <text x={10} y={244} className="gx-ig-t gx-ig-suave">{t('guias.ig.ludra-tablero.t0')}</text>
      <text x={210} y={244} textAnchor="middle" className="gx-ig-t gx-ig-suave">{t('guias.ig.ludra-tablero.t20')}</text>
      <text x={310} y={244} textAnchor="middle" className="gx-ig-t gx-ig-suave">{t('guias.ig.ludra-tablero.t30')}</text>
    </svg>
  );
}

/** Arena redonda con el jefe en el centro (base de los esquemas de Rahu y Ketu). */
function Arena({ jefe, children }: { jefe: string; children: ReactNode }) {
  return (
    <>
      <circle cx={110} cy={112} r={96} className="gx-ig-arena" />
      <circle cx={110} cy={112} r={13} className="gx-ig-jefe" />
      <text x={110} y={116} textAnchor="middle" className="gx-ig-t gx-ig-sobre-jefe">{jefe}</text>
      {children}
    </>
  );
}

/** Rahu: la marca que se pasa; sin recoger deja una zona y la tercera hace wipe. */
function RahuMarca({ t }: Props) {
  return (
    <svg viewBox={`0 0 ${W} 228`} role="img" aria-label={t('guias.ig.rahu-marca.alt')}>
      <Arena jefe={t('guias.ig.rahu')}>
        <circle cx={70} cy={70} r={20} className="gx-ig-marca" />
        <Jugador x={70} y={70} clase="is-marcado" />
        <Jugador x={112} y={52} />
        <path d="M108,55 L84,64" className="gx-ig-flecha" markerEnd="url(#gx-ig-punta)" />
        <circle cx={140} cy={162} r={13} className="gx-ig-zona" />
        <circle cx={72} cy={160} r={13} className="gx-ig-zona" />
      </Arena>
      <Lineas x={222} y={40} texto={t('guias.ig.rahu-marca.lleva')} />
      <Lineas x={222} y={84} texto={t('guias.ig.rahu-marca.recoge')} />
      <Lineas x={222} y={128} texto={t('guias.ig.rahu-marca.zona')} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx={234 + i * 30} cy={186} r={11} className={i === 2 ? 'gx-ig-zona is-wipe' : 'gx-ig-zona'} />
          <text x={234 + i * 30} y={190} textAnchor="middle" className="gx-ig-t gx-ig-claro">{i + 1}</text>
        </g>
      ))}
      <text x={222} y={216} className="gx-ig-t gx-ig-malo">{t('guias.ig.rahu-marca.wipe')}</text>
    </svg>
  );
}

/** Rahu: depredadores alrededor; el rayo dirigido los mata; cada uno vivo deja una zona. */
function RahuDepredadores({ t }: Props) {
  const adds: [number, number, boolean][] = [[110, 34, true], [188, 112, false], [110, 190, true], [32, 112, true]];
  return (
    <svg viewBox={`0 0 ${W} 228`} role="img" aria-label={t('guias.ig.rahu-depredadores.alt')}>
      <Arena jefe={t('guias.ig.rahu')}>
        {adds.map(([x, y, muerto], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={14} className="gx-ig-anillo" />
            <rect x={x - 6} y={y - 6} width={12} height={12} rx={2} className={muerto ? 'gx-ig-add is-muerto' : 'gx-ig-add'} />
          </g>
        ))}
        <Jugador x={74} y={128} clase="is-marcado" />
        <path d="M74,128 L36,114" className="gx-ig-rayo" />
        <path d="M188,126 C188,150 176,160 162,166" className="gx-ig-flecha" markerEnd="url(#gx-ig-punta)" />
        <circle cx={152} cy={170} r={11} className="gx-ig-zona" />
      </Arena>
      <Lineas x={222} y={40} texto={t('guias.ig.rahu-depredadores.rayo')} />
      <Lineas x={222} y={100} texto={t('guias.ig.rahu-depredadores.vivo')} />
      <Lineas x={222} y={160} texto={t('guias.ig.rahu-depredadores.aviso')} />
    </svg>
  );
}

/** Ketu: piedras de alma en el borde; romper la tuya da invulnerabilidad justo antes del golpe a toda la arena. */
function KetuPiedras({ t }: Props) {
  const piedras = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * 2 * Math.PI - Math.PI / 2; return [110 + 84 * Math.cos(a), 112 + 84 * Math.sin(a)] as const; });
  return (
    <svg viewBox={`0 0 ${W} 228`} role="img" aria-label={t('guias.ig.ketu-piedras.alt')}>
      <Arena jefe={t('guias.ig.ketu')}>
        <circle cx={110} cy={112} r={40} className="gx-ig-onda" />
        <circle cx={110} cy={112} r={62} className="gx-ig-onda" />
        {piedras.map(([x, y], i) => (
          <path key={i} d={`M${x},${y - 8}L${x + 6},${y}L${x},${y + 8}L${x - 6},${y}Z`} className={i === 1 ? 'gx-ig-piedra is-rota' : 'gx-ig-piedra'} />
        ))}
        {/* Un jugador rompe su piedra con su cono y queda protegido */}
        <path d={`M${piedras[1][0] - 26},${piedras[1][1] + 16} L${piedras[1][0] - 2},${piedras[1][1] - 6} L${piedras[1][0] + 4},${piedras[1][1] + 8} Z`} className="gx-ig-cono" />
        <circle cx={piedras[1][0] - 26} cy={piedras[1][1] + 16} r={9} className="gx-ig-escudo" />
        <Jugador x={piedras[1][0] - 26} y={piedras[1][1] + 16} />
        {/* El Clérigo, que aguanta y resucita */}
        <circle cx={piedras[4][0] + 22} cy={piedras[4][1] + 4} r={9} className="gx-ig-escudo" />
        <Jugador x={piedras[4][0] + 22} y={piedras[4][1] + 4} clase="is-sanador" />
        <text x={piedras[4][0] + 22} y={piedras[4][1] + 24} textAnchor="middle" className="gx-ig-t gx-ig-suave">{t('guias.ig.ketu-piedras.clerigo')}</text>
      </Arena>
      <Lineas x={222} y={40} texto={t('guias.ig.ketu-piedras.rompe')} />
      <Lineas x={222} y={104} texto={t('guias.ig.ketu-piedras.golpe')} />
      <Lineas x={222} y={160} texto={t('guias.ig.ketu-piedras.plan')} />
    </svg>
  );
}

const DIBUJOS: Record<IdInfografia, (p: Props) => ReactNode> = {
  'ludra-tablero': LudraTablero,
  'rahu-marca': RahuMarca,
  'rahu-depredadores': RahuDepredadores,
  'ketu-piedras': KetuPiedras,
};

/** La infografía con su pie («esquema propio…»). La punta de flecha se define una vez por dibujo. */
export default function Infografia({ id, t }: { id: IdInfografia; t: Traductor }) {
  const Dibujo = DIBUJOS[id];
  return (
    <figure className="gx-ig">
      <svg width="0" height="0" className="gx-ig-defs" aria-hidden="true">
        <defs>
          <marker id="gx-ig-punta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 Z" className="gx-ig-punta" />
          </marker>
        </defs>
      </svg>
      <Dibujo t={t} />
      <figcaption className="rx-note">{t(`guias.ig.${id}.pie` as Clave)}</figcaption>
    </figure>
  );
}
