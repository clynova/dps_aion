// Zona de cuenta de la barra superior. Lee la sesión: siempre dentro de <Suspense> (lo pone BarraSuperior).
import Link from 'next/link';
/* eslint-disable @next/next/no-img-element -- avatares de cdn.discordapp.com, 24 px: next/image no aporta nada aquí */
import { usuarioActual } from '@/lib/auth/sesion';
import { rutaEn } from '@/lib/i18n';
import { textos } from '@/lib/i18n/servidor';
import { BotonEntrar, BotonSalir } from './BotonesCuenta';

export default async function Cuenta() {
  const [{ t, idioma }, u] = await Promise.all([textos(), usuarioActual()]);
  if (!u) return <BotonEntrar texto={t('cuenta.entrar')} />;
  return (
    <div className="cx-cuenta" aria-label={t('cuenta.aria')}>
      {u.imagen ? <img className="cx-avatar" src={u.imagen} alt="" width={24} height={24} /> : null}
      <Link className="cx-enlace" href={rutaEn(idioma, '/mis-grupos')}>{u.nombre}</Link>
      <BotonSalir texto={t('cuenta.salir')} />
    </div>
  );
}
