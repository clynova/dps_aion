// Ajustes del grupo: datos generales, miembros con sus roles e invitaciones. Cada sección y cada control aparecen
// solo si el rol de quien mira lo permite (lib/permisos.ts); el servidor lo vuelve a comprobar al enviar.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
/* eslint-disable @next/next/no-img-element -- avatares de Discord, 24 px */
import BarraSuperior from '@/components/BarraSuperior';
import Formulario from '@/components/Formulario';
import CopiarEnlace from '@/components/grupos/CopiarEnlace';
import CrearToken from '@/components/grupos/CrearToken';
import {
  accionAjustes, accionBorrarGrupo, accionCambiarRol, accionCrearInvitacion, accionExpulsar, accionRevocarInvitacion,
  accionRevocarToken, accionWebhook,
} from '@/lib/acciones/grupos';
import { usuarioActual } from '@/lib/auth/sesion';
import { grupoParaVer, invitacionesActivas, miembrosDe, raidsDelGrupo, tokensDe } from '@/lib/db/grupos';
import { localeDe, rutaEn } from '@/lib/i18n';
import { textosError } from '@/lib/i18n/errores';
import { textos } from '@/lib/i18n/servidor';
import { ROLES, VISIBILIDADES, puede, puedeCambiarRol, puedeExpulsar, puedeInvitarCon } from '@/lib/permisos';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await textos();
  return { title: t('grupo.ajustes'), robots: { index: false } };
}

export default async function Ajustes({ params }: PageProps<'/[lang]/g/[grupo]/ajustes'>) {
  const { t } = await textos();
  return (
    <main className="rx">
      <Suspense fallback={<header className="rx-head"><BarraSuperior /><p className="rx-note">{t('raid.loading')}</p></header>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: PageProps<'/[lang]/g/[grupo]/ajustes'>['params'] }) {
  const [{ grupo: slug }, { t, idioma }, u] = await Promise.all([params, textos(), usuarioActual()]);
  const r = await grupoParaVer(slug, u?.id ?? null);
  if (!r || !r.rol || !u) notFound(); // solo miembros
  const { grupo, rol } = r;
  const [lista, invs, toks, nRaids] = await Promise.all([
    miembrosDe(grupo.id),
    puede(rol, 'invitar') ? invitacionesActivas(grupo.id) : Promise.resolve([]),
    puede(rol, 'ajustes') ? tokensDe(grupo.id) : Promise.resolve([]),
    puede(rol, 'borrar_grupo') ? raidsDelGrupo(grupo.id) : Promise.resolve(0),
  ]);
  const errores = textosError(t);
  const campos = { lang: idioma, grupo: grupo.slug };
  const fecha = (d: Date) => d.toLocaleDateString(localeDe(idioma), { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <header className="rx-head">
        <BarraSuperior><Link className="rx-back" href={rutaEn(idioma, `/g/${grupo.slug}`)}>{t('comun.volver')}</Link></BarraSuperior>
        <h1 className="rx-title">{t('ajustes.titulo', { grupo: grupo.nombre })}</h1>
        <p className="rx-lede">{t('grupo.tuRol', { rol: t(`rol.${rol}`) })}</p>
      </header>

      {puede(rol, 'ajustes') ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('ajustes.general')}</h2>
          <Formulario accion={accionAjustes} campos={campos} textos={errores} guardado={t('comun.guardado')}>
            <div className="cx-campo">
              <label htmlFor="a-nombre">{t('grupos.nombre')}</label>
              <input id="a-nombre" name="nombre" className="cx-input" defaultValue={grupo.nombre} required minLength={2} maxLength={60} />
            </div>
            <label className="cx-check"><input type="checkbox" name="visible" defaultChecked={grupo.visible} /> {t('ajustes.visible')}</label>
            <div className="cx-campo">
              <label htmlFor="a-vis">{t('ajustes.visDefecto')}</label>
              <select id="a-vis" name="visibilidadDefecto" className="cx-select" defaultValue={grupo.visibilidadDefecto}>
                {VISIBILIDADES.map((v) => <option key={v} value={v}>{t(`vis.${v}`)}</option>)}
              </select>
            </div>
            <div><button type="submit" className="cx-boton">{t('comun.guardar')}</button></div>
          </Formulario>
        </section>
      ) : null}

      <section className="rx-section">
        <h2 className="rx-h2">{t('ajustes.miembros')}</h2>
        <ul className="cx-lista rx-card">
          {lista.map((m) => {
            const yo = m.usuarioId === u.id;
            const rolesPosibles = ROLES.filter((nuevo) => nuevo === m.rol || puedeCambiarRol(rol, m.rol, nuevo, yo));
            return (
              <li key={m.usuarioId}>
                {m.imagen ? <img className="cx-avatar" src={m.imagen} alt="" width={24} height={24} /> : null}
                <span className="cx-crece">
                  <span><b>{m.nombre}</b> {yo ? <span className="rx-note">{t('ajustes.tu')}</span> : null}</span>
                  <span className="rx-note">{t('ajustes.desde', { d: fecha(m.desde) })}</span>
                </span>
                {rolesPosibles.length > 1 ? (
                  <Formulario accion={accionCambiarRol} campos={{ ...campos, usuario: m.usuarioId }} textos={errores} className="cx-fila">
                    <select name="rol" className="cx-select" defaultValue={m.rol} aria-label={t('ajustes.cambiarRol', { n: m.nombre })}>
                      {rolesPosibles.map((x) => <option key={x} value={x}>{t(`rol.${x}`)}</option>)}
                    </select>
                    <button type="submit" className="cx-boton cx-boton-sec">{t('comun.guardar')}</button>
                  </Formulario>
                ) : <span className="rx-pill">{t(`rol.${m.rol}`)}</span>}
                {puedeExpulsar(rol, m.rol, yo) ? (
                  <Formulario accion={accionExpulsar} campos={{ ...campos, usuario: m.usuarioId }} textos={errores} className="cx-fila"
                    confirmar={yo ? t('ajustes.confirmarSalir') : t('ajustes.confirmarExpulsar', { n: m.nombre })}>
                    <button type="submit" className="cx-boton cx-boton-peligro">{yo ? t('ajustes.salir') : t('ajustes.expulsar')}</button>
                  </Formulario>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {puede(rol, 'invitar') ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('ajustes.invitaciones')}</h2>
          <p className="rx-note">{t('ajustes.invitaciones.nota')}</p>
          {invs.length ? (
            <ul className="cx-lista rx-card">
              {invs.map((i) => (
                <li key={i.codigo}>
                  <span className="cx-crece">
                    <span><span className="rx-pill">{t(`rol.${i.rol}`)}</span>{' '}
                      <span className="rx-note">
                        {i.usosMax ? t('ajustes.inv.usosDe', { u: i.usos, m: i.usosMax }) : t('ajustes.inv.usosN', { u: i.usos })}
                        {' · '}{i.caduca ? t('ajustes.inv.caducaEl', { d: fecha(i.caduca) }) : t('ajustes.inv.nunca')}
                      </span>
                    </span>
                    <CopiarEnlace ruta={rutaEn(idioma, `/unirse/${i.codigo}`)} texto={t('ajustes.inv.copiar')} copiado={t('ajustes.inv.copiado')} />
                  </span>
                  <Formulario accion={accionRevocarInvitacion} campos={{ ...campos, codigo: i.codigo }} textos={errores} className="cx-fila">
                    <button type="submit" className="cx-boton cx-boton-peligro">{t('ajustes.inv.revocar')}</button>
                  </Formulario>
                </li>
              ))}
            </ul>
          ) : <p className="rx-pending">{t('ajustes.invitaciones.vacio')}</p>}
          <Formulario accion={accionCrearInvitacion} campos={campos} textos={errores} className="cx-fila">
            <div className="cx-campo">
              <label htmlFor="i-rol">{t('ajustes.inv.rol')}</label>
              <select id="i-rol" name="rol" className="cx-select" defaultValue="miembro">
                {ROLES.filter((x) => puedeInvitarCon(rol, x)).map((x) => <option key={x} value={x}>{t(`rol.${x}`)}</option>)}
              </select>
            </div>
            <div className="cx-campo">
              <label htmlFor="i-dias">{t('ajustes.inv.caduca')}</label>
              <select id="i-dias" name="dias" className="cx-select" defaultValue="7">
                {['1', '7', '30'].map((d) => <option key={d} value={d}>{t('ajustes.inv.dias', { n: d })}</option>)}
                <option value="nunca">{t('ajustes.inv.nunca')}</option>
              </select>
            </div>
            <div className="cx-campo">
              <label htmlFor="i-usos">{t('ajustes.inv.usos')}</label>
              <select id="i-usos" name="usos" className="cx-select" defaultValue="sin">
                {['1', '5', '25'].map((d) => <option key={d} value={d}>{d}</option>)}
                <option value="sin">{t('ajustes.inv.sinLimite')}</option>
              </select>
            </div>
            <button type="submit" className="cx-boton">{t('ajustes.inv.crear')}</button>
          </Formulario>
        </section>
      ) : null}
      {puede(rol, 'ajustes') ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('ajustes.tokens')}</h2>
          <p className="rx-note">{t('ajustes.tokens.nota')}</p>
          {toks.length ? (
            <ul className="cx-lista rx-card">
              {toks.map((k) => (
                <li key={k.id}>
                  <span className="cx-crece">
                    <span><b>{k.nombre}</b></span>
                    <span className="rx-note">
                      {t('ajustes.tokens.creado', { d: fecha(k.creado) })}{' · '}
                      {k.ultimoUso ? t('ajustes.tokens.usado', { d: fecha(k.ultimoUso) }) : t('ajustes.tokens.sinUso')}
                    </span>
                  </span>
                  <Formulario accion={accionRevocarToken} campos={{ ...campos, id: k.id }} textos={errores} className="cx-fila"
                    confirmar={t('ajustes.tokens.confirmar', { n: k.nombre })}>
                    <button type="submit" className="cx-boton cx-boton-peligro">{t('ajustes.tokens.revocar')}</button>
                  </Formulario>
                </li>
              ))}
            </ul>
          ) : <p className="rx-pending">{t('ajustes.tokens.vacio')}</p>}
          <CrearToken campos={campos} textos={errores} t={{ nombre: t('ajustes.tokens.nombre'), crear: t('ajustes.tokens.crear'),
            nuevo: t('ajustes.tokens.nuevo'), copiar: t('ajustes.inv.copiar').replace(/ .*/, ''), copiado: t('ajustes.inv.copiado') }} />
        </section>
      ) : null}
      {puede(rol, 'ajustes') ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('ajustes.webhook')}</h2>
          <p className="rx-note">{t('ajustes.webhook.nota')}</p>
          {grupo.discordWebhookCifrado ? (
            <div className="cx-fila">
              <span className="rx-pill is-ok">{t('ajustes.webhook.configurado')}</span>
              <Formulario accion={accionWebhook} campos={{ ...campos, quitar: '1' }} textos={errores} className="cx-fila"
                confirmar={t('ajustes.webhook.confirmarQuitar')}>
                <button type="submit" className="cx-boton cx-boton-peligro">{t('ajustes.webhook.quitar')}</button>
              </Formulario>
            </div>
          ) : <p className="rx-pending">{t('ajustes.webhook.vacio')}</p>}
          <Formulario accion={accionWebhook} campos={campos} textos={errores} guardado={t('comun.guardado')} className="cx-fila">
            <div className="cx-campo cx-crece">
              <label htmlFor="w-url">{grupo.discordWebhookCifrado ? t('ajustes.webhook.cambiar') : t('ajustes.webhook.url')}</label>
              <input id="w-url" name="url" type="url" className="cx-input" required autoComplete="off" spellCheck={false}
                maxLength={300} placeholder="https://discord.com/api/webhooks/…" />
            </div>
            <button type="submit" className="cx-boton">{t('comun.guardar')}</button>
          </Formulario>
        </section>
      ) : null}
      {puede(rol, 'borrar_grupo') ? (
        <section className="rx-section">
          <h2 className="rx-h2">{t('ajustes.borrar')}</h2>
          <p className="rx-note">{t('ajustes.borrar.nota', { n: nRaids })}</p>
          <Formulario accion={accionBorrarGrupo} campos={campos} textos={errores} className="cx-fila"
            confirmar={t('ajustes.borrar.confirmar', { n: grupo.nombre })}>
            <div className="cx-campo">
              <label htmlFor="b-confirmacion">{t('ajustes.borrar.escribe', { slug: grupo.slug })}</label>
              <input id="b-confirmacion" name="confirmacion" className="cx-input" required autoComplete="off"
                pattern={grupo.slug} spellCheck={false} />
            </div>
            <button type="submit" className="cx-boton cx-boton-peligro">{t('ajustes.borrar.boton')}</button>
          </Formulario>
        </section>
      ) : null}
    </>
  );
}
