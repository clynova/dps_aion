// «El combate por % de vida» (ficha de un jefe, módulo «Raids»): de izquierda a derecha la vida que le queda al jefe
// (100 → 0 %). Arriba, las fases de la ficha; en medio, los wipes de las raids públicas por tramo de 5 %; las letras,
// ataques que salen siempre al mismo % de vida (deducido). SVG del servidor, sin JavaScript.
import GraficoAjustado from '@/components/jefe/GraficoAjustado';
import type { Traductor } from '@/lib/i18n';

const W = 720, H = 240, M = { t: 10, r: 14, b: 40, l: 34 };
const FASES_H = 26;

type Props = {
  t: Traductor;
  fases: { titulo: string; desde_vida: number; hasta_vida: number }[];
  /** Wipes por tramo de 5 % de vida QUITADA (lib/raids/jefe.ts) */
  muro: { desde: number; wipes: number }[];
  marcas: { nombre: string; vida: number }[];
};

export default function LineaVida({ t, fases, muro, marcas }: Props) {
  const x = (vida: number) => M.l + ((100 - vida) / 100) * (W - M.l - M.r);
  const max = Math.max(1, ...muro.map((m) => m.wipes));
  // Letras en filas: una pegada a la anterior baja a la fila siguiente
  const ultima: number[] = [];
  const filas = marcas.map((m) => {
    let f = ultima.findIndex((u) => x(m.vida) - u >= 14);
    if (f < 0) f = ultima.length;
    ultima[f] = x(m.vida);
    return f;
  });
  const yFases = M.t;
  const arriba = yFases + FASES_H + 8 + 12 * (marcas.length ? Math.max(...filas) + 1 : 0);
  const y = (v: number) => arriba + (1 - v / max) * (H - arriba - M.b);
  const pasos = max <= 4 ? Array.from({ length: max + 1 }, (_, k) => k) : [0, Math.round(max / 2), max];
  return (
    <GraficoAjustado ancho={W}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('guias.linea.t')}>
        {fases.map((f, k) => (
          <g key={k}>
            <rect x={x(f.desde_vida) + 1} width={Math.max(2, x(f.hasta_vida) - x(f.desde_vida) - 2)} y={yFases} height={FASES_H} rx={3}
              className={`gx-fase-banda is-${k % 2}`}>
              <title>{`${f.titulo}: ${f.desde_vida} → ${f.hasta_vida} %`}</title>
            </rect>
            {x(f.hasta_vida) - x(f.desde_vida) > 60 ? (
              <text x={(x(f.desde_vida) + x(f.hasta_vida)) / 2} y={yFases + FASES_H / 2} dy="0.32em" textAnchor="middle" className="gx-fase-texto">
                {f.titulo.length > 22 ? `${f.titulo.slice(0, 21)}…` : f.titulo}
              </text>
            ) : null}
          </g>
        ))}
        {muro.length ? pasos.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} className={v ? 'jx-grid' : 'jx-eje'} />
            <text x={M.l - 6} y={y(v)} dy="0.32em" textAnchor="end">{v}</text>
          </g>
        )) : null}
        {muro.filter((m) => m.wipes).map((m) => (
          <rect key={m.desde} x={x(100 - m.desde) + 1} width={x(95) - x(100) - 2} y={y(m.wipes)} height={y(0) - y(m.wipes)} className="jx-barra" rx={2}>
            <title>{`${100 - m.desde - 5}–${100 - m.desde} %: ${m.wipes}`}</title>
          </rect>
        ))}
        {marcas.map((m, k) => (
          <g key={k}>
            <line x1={x(m.vida)} x2={x(m.vida)} y1={yFases + FASES_H + 8 + 12 * filas[k] + 2} y2={muro.length ? y(0) : H - M.b} className="jx-marca" />
            <text x={x(m.vida)} y={yFases + FASES_H + 8 + 12 * filas[k]} textAnchor="middle" className="rx-strong">{String.fromCharCode(65 + k)}</text>
          </g>
        ))}
        {[100, 75, 50, 25, 0].map((v) => (
          <text key={v} x={x(v)} y={H - M.b + 16} textAnchor="middle">{t('cmp.pct', { n: v })}</text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle">{t('guias.linea.eje')}</text>
      </svg>
    </GraficoAjustado>
  );
}
