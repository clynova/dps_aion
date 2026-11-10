// «Jefes» de la página de un grupo: un enlace a la página de cada jefe (components/jefe/PaginaJefe.tsx) con sus
// raids y su mejor resultado. Sale del servidor, con las raids que quien mira puede ver en la página del grupo.
import Link from 'next/link';
import { localeDe, rutaEn, type Idioma, type Traductor } from '@/lib/i18n';

type Raid = { npc: number; jefe: string | null; matado: boolean; mejor_pct: number | null; fecha: string };

export default function Jefes({ t, idioma, grupo, raids, npcs }: { t: Traductor; idioma: Idioma; grupo: string; raids: Raid[]; npcs: Record<string, string> }) {
  const porNpc = new Map<number, Raid[]>();
  for (const r of raids) porNpc.set(r.npc, [...(porNpc.get(r.npc) ?? []), r]);
  if (!porNpc.size) return null;
  const n1 = new Intl.NumberFormat(localeDe(idioma), { maximumFractionDigits: 1 });
  // Primero el que se jugó más recientemente
  const jefes = [...porNpc].map(([npc, rs]) => ({
    npc, nombre: npcs[String(npc)] ?? rs[0].jefe ?? String(npc), raids: rs.length, matado: rs.some((r) => r.matado),
    mejor: Math.max(0, ...rs.map((r) => r.mejor_pct ?? 0)), ultima: Math.max(...rs.map((r) => Date.parse(r.fecha))),
  })).sort((a, b) => b.ultima - a.ultima);
  return (
    <section className="rx-section" id="jefes">
      <h2 className="rx-h2">{t('jefe.lista.t')}</h2>
      <ul className="jx-jefes">
        {jefes.map((j) => (
          <li key={j.npc}>
            <Link href={rutaEn(idioma, `/g/${grupo}/jefes/${j.npc}`)}>
              <span className="hm-name">{j.nombre}</span>
              <span className="hm-sub">
                {t(j.raids === 1 ? 'jefe.lista.raid1' : 'jefe.lista.raidN', { n: j.raids })} · {j.matado
                  ? <span className="rx-seg-ok">{t('home.stat.kill')}</span>
                  : t('jefe.lista.mejor', { p: t('cmp.pct', { n: n1.format(j.mejor) }) })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
