// Tarjeta del perfil (pestaña «Rotación»): las especializaciones del jugador en su raid más reciente frente a las de
// los demás de su clase en las raids que se pueden ver (lib/raids/especializaciones.ts). Sale del servidor.
import TablaEspecializaciones from '@/components/raid/TablaEspecializaciones';
import { localeDe, type Clave, type Idioma, type Traductor } from '@/lib/i18n';
import type { especializacionesDePerfil } from '@/lib/raids/especializaciones';

type Props = {
  t: Traductor; idioma: Idioma; jugador: string; datos: NonNullable<ReturnType<typeof especializacionesDePerfil>>;
  nombres: { apodos: Record<string, string>; habilidades: Record<string, string> };
};

export default function Especializaciones({ t, idioma, jugador, datos, nombres }: Props) {
  const dia = (f: string) => new Intl.DateTimeFormat(localeDe(idioma), { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${f.slice(0, 10)}T12:00:00Z`));
  const nombreHab = (id: string) => nombres.apodos[id] || nombres.habilidades[id] || id;
  return (
    <article className="rx-card bx-perfil">
      <h3>{t('bx.perfil.t', { c: t(`class.${datos.clase}` as Clave) })}</h3>
      <p className="rx-note">{t(datos.jugadores.length > 1 ? 'bx.perfil.nota' : 'bx.perfil.solo')} {t('bx.esp.nota')}</p>
      <TablaEspecializaciones t={t} tabla={datos} nombreHab={nombreHab} destacar={jugador} subtitulos={datos.fechas.map(dia)} />
    </article>
  );
}
