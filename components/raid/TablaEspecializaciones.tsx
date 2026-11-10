// Tabla de especializaciones de una clase (lib/raids/especializaciones.ts): una fila por habilidad y una columna por
// jugador, con las opciones que eligió; marca a quien se aparta de la mayoría. La usan la página de la raid
// (components/raid/Builds.tsx) y el perfil (components/jugador/Especializaciones.tsx).
import type { Traductor } from '@/lib/i18n';
import { formatoOpciones, type TablaClase } from '@/lib/raids/especializaciones';
import NombreJugador from '@/components/raid/NombreJugador';

type Props = { t: Traductor; tabla: TablaClase; nombreHab: (id: string) => string; destacar?: string; subtitulos?: (string | null)[];
  /** En la página de la raid, cada nombre enlaza a su ficha */
  enlazar?: boolean };

export default function TablaEspecializaciones({ t, tabla, nombreHab, destacar, subtitulos, enlazar }: Props) {
  return (
    <div className="rx-table-wrap">
      <table className="rx-table bx-esp">
        <thead>
          <tr>
            <th>{t('bx.th.habilidad')}</th>
            {tabla.jugadores.map((j, k) => (
              <th key={j} className={j === destacar ? 'is-yo' : undefined}>{enlazar ? <NombreJugador n={j} /> : j}{subtitulos?.[k] ? <small>{subtitulos[k]}</small> : null}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((f) => (
            <tr key={f.habilidad}>
              <td>{nombreHab(f.habilidad)}</td>
              {f.opciones.map((o, k) => {
                const e = f.estado[k];
                return (
                  <td key={tabla.jugadores[k]} className={e === 'distinta' ? 'is-distinta' : e === 'variada' ? 'is-variada' : undefined}
                    title={e === 'distinta' ? t('bx.distinta') : e === 'variada' ? t('bx.variada') : undefined}>
                    {o ? formatoOpciones(o) : '—'}{e === 'distinta' ? <span aria-hidden="true"> ●</span> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
