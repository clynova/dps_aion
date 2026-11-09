// Resumen de una raid recién subida en el Discord del grupo (Ajustes → «Aviso en Discord» → avisar de cada raid).
// Usa el mismo webhook que «Solicitar análisis». El mensaje lleva las cifras de la raid y, si ya tiene análisis, su
// titular y los títulos de las primeras recomendaciones, en el idioma con el que se activó; nunca menciona a nadie.
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { webhookDe } from '@/lib/db/grupos';
import { analisis, grupos, raids } from '@/lib/db/schema';
import { enviarDiscord } from '@/lib/discord';
import { esIdioma, localeDe, rutaEn, traductor, type Idioma } from '@/lib/i18n';
import { nombresPara, type Nombres } from '@/lib/raids/vista';

export type DatosAviso = {
  jefe: string; intentos: number; matado: boolean; mejorPct: number | null; muertes: number | null; dps: number | null;
  /** Del análisis de la raid, si lo hay: los ids de habilidades van como en la web (números sueltos) */
  titular?: string; recomendaciones?: string[];
};

const MAX_RECOS = 3;

/** Texto del aviso. Los ids de habilidades y NPC se cambian por su «nombre», como hace la página. */
export function mensajeRaid(d: DatosAviso, url: string, idioma: Idioma, nombres?: Pick<Nombres, 'apodos' | 'habilidades' | 'npcs'>): string {
  const t = traductor(idioma);
  const loc = localeDe(idioma);
  const n1 = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const n2 = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 });
  const k = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
  const conNombres = (x: string) => x.replace(/\b\d{6,8}\b/g, (id) => {
    const n = nombres && (nombres.apodos[id] || nombres.habilidades[id] || nombres.npcs[id]);
    return n ? t('q.open') + n + t('q.close') : id;
  });
  const lineas = [
    t(d.matado ? 'aviso.kill' : 'aviso.wipe', { jefe: d.jefe, n: d.intentos, pct: d.mejorPct === null ? '—' : n1.format(d.mejorPct) }),
    t('aviso.cifras', { m: d.muertes ?? 0, mi: n2.format((d.muertes ?? 0) / Math.max(1, d.intentos)), dps: d.dps === null ? '—' : k.format(d.dps) }),
  ];
  if (d.titular) lineas.push('', conNombres(d.titular));
  const recos = (d.recomendaciones ?? []).slice(0, MAX_RECOS);
  if (recos.length) lineas.push('', t('aviso.recos'), ...recos.map((r) => `• ${conNombres(r.replace(/\*\*/g, ''))}`));
  // El enlace va siempre: si el texto no cabe en un mensaje de Discord, se recorta el texto y no el enlace
  const pie = `\n\n${url}`;
  let cuerpo = lineas.join('\n');
  if (cuerpo.length + pie.length > 2000) cuerpo = cuerpo.slice(0, 2000 - pie.length - 1).trimEnd() + '…';
  return cuerpo + pie;
}

export type ResultadoAviso = { ok: true } | { ok: false; motivo: 'desactivado' | 'sin-webhook' | 'raid' | 'discord' };

/** Manda el aviso de la raid si el grupo lo tiene activado. `origen` es la dirección del sitio (https://…). */
export async function avisarRaid(raidId: string, origen: string): Promise<ResultadoAviso> {
  const [f] = await db.select({ raid: raids, grupo: grupos }).from(raids).innerJoin(grupos, eq(grupos.id, raids.grupoId)).where(eq(raids.id, raidId)).limit(1);
  if (!f) return { ok: false, motivo: 'raid' };
  const idioma = f.grupo.avisoRaids;
  if (!idioma || !esIdioma(idioma)) return { ok: false, motivo: 'desactivado' };
  const webhook = webhookDe(f.grupo);
  if (!webhook) return { ok: false, motivo: 'sin-webhook' };
  const [textos, nombres] = await Promise.all([
    db.select({ idioma: analisis.idioma, contenido: analisis.contenido }).from(analisis).where(and(eq(analisis.raidId, raidId), inArray(analisis.idioma, ['es', idioma]))),
    nombresPara(idioma, f.grupo.id),
  ]);
  type A = { pendiente?: boolean; titular?: string; recomendaciones?: { titulo: string }[] };
  const de = (i: string) => textos.find((x) => x.idioma === i && !(x.contenido as A).pendiente)?.contenido as A | undefined;
  const a = de(idioma) ?? de('es');
  const texto = mensajeRaid({
    jefe: nombres.npcs[String(f.raid.npcJefe)] || f.raid.jefe || String(f.raid.npcJefe), intentos: f.raid.intentos, matado: f.raid.matado, mejorPct: f.raid.mejorPct,
    muertes: f.raid.muertesGrupo, dps: f.raid.dpsGrupoMedio, titular: a?.titular, recomendaciones: a?.recomendaciones?.map((r) => r.titulo),
  }, origen + rutaEn(idioma, `/g/${f.grupo.slug}/raids/${f.raid.slug}`), idioma, nombres);
  return (await enviarDiscord(webhook, texto)) ? { ok: true } : { ok: false, motivo: 'discord' };
}
