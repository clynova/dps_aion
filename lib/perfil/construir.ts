// Perfiles de jugador a partir de sus raids: port de tools/perfiles.ps1 (mismos campos, mismas cuentas, mismo
// redondeo). Función pura: recibe las raids en formato data.json (lib/raids/reconstruir.ts) y devuelve los perfiles
// y el índice. La paridad con jugadores/*/data.json la comprueba scripts/paridad.mts.
// En la web multigrupo se llama con las raids que quien mira puede ver.

/* eslint-disable @typescript-eslint/no-explicit-any -- el data.json es dinámico, como en el script original */
type Raid = any;

/**
 * Math.Round de .NET Framework (PowerShell 5.1), que es lo que usaba perfiles.ps1: escala por 10^d, redondea al par
 * (a + 0.5, floor, y si era exactamente .5 y salió impar, uno menos) y vuelve a dividir. No es Math.round de JS.
 */
export function redondeoNet(x: number, d = 0): number {
  const p = 10 ** d;
  const a = x * p;
  if (Number.isInteger(a)) return a / p;
  const t = a + 0.5;
  let f = Math.floor(t);
  if (f === t && f % 2 !== 0) f -= 1;
  const r = a < 0 ? -Math.abs(f) : f;
  return r / p;
}

const media = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
const avg1 = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x !== null && x !== undefined); return v.length ? redondeoNet(media(v), 1) : null; };
const suma = (o: Record<string, number> | null | undefined) => (o ? Object.values(o).reduce((s, v) => s + Number(v), 0) : 0);
/** Orden estable descendente (Sort-Object -Descending conserva el orden de llegada en los empates) */
const desc = <T>(xs: T[], k: (x: T) => number) => xs.map((x, i) => [x, i] as const).sort((a, b) => k(b[0]) - k(a[0]) || a[1] - b[1]).map(([x]) => x);

export function slugJugador(nombre: string): string {
  return nombre.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function primeraMuerteMedia(muertes: any[]): number | null {
  if (!muertes?.length) return null;
  const min = new Map<number, number>();
  for (const m of muertes) min.set(m.intento, Math.min(min.get(m.intento) ?? Infinity, m.t));
  return redondeoNet(media([...min.values()]));
}
function apoyoDe(nombre: string, det: any) {
  const ap = det?.apoyo; if (!ap) return null;
  const propia = (ap.cura_obj ?? []).filter((o: any) => o.jugador === nombre).reduce((s: number, o: any) => s + Number(o.cantidad), 0);
  return { curacion: ap.curacion, escudos: ap.escudos, absorbido: ap.absorbido, propia_pct: ap.curacion ? redondeoNet(100 * propia / ap.curacion, 1) : 0 };
}
function supervivenciaDe(det: any) {
  const sv = det?.supervivencia; if (!sv) return null;
  const mit = suma(sv.mitigados), ms = det.muertes ?? [];
  return {
    golpes: sv.golpes, mitigados: mit, mitigados_pct: sv.golpes ? redondeoNet(100 * mit / sv.golpes, 1) : 0,
    evitados: suma(sv.evitados), cura_recibida: sv.cura_recibida, escudo_recibido: sv.escudo_recibido,
    resurrecciones: sv.resurrecciones, bajo30_pct: sv.bajo30_pct,
    muertes_rapidas: ms.filter((m: any) => m.vida_5s !== null && m.vida_5s !== undefined && m.vida_5s >= 70).length,
    vida_5s_media: avg1(ms.map((m: any) => m.vida_5s)),
  };
}
function rotacionDe(det: any) {
  const ro = det?.rotacion; if (!ro) return null;
  return { usos: ro.usos, vivo_s: ro.vivo_s, usos_min: ro.usos_min, pausas_pct: ro.pausas_pct, primer_golpe_s: ro.primer_golpe_s };
}
const CLAVES_ROT = ['usos_min', 'pausas_pct', 'primer_golpe_s'] as const;

type Acumulado = {
  raids: any[]; skills: Map<string, number>; causes: Map<string, { habilidad: string; origen: string; n: number; max: number }>;
  heals: Map<string, number>; healTo: Map<string, number>; mit: Map<string, number>; evi: Map<string, number>;
  deaths: any[]; casts: Map<string, { usos: number; int: number }>; buffs: Map<string, number[]>; vivo: number;
};
const sumar = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

/** Perfiles de todos los jugadores de estas raids. `conPerfil`: slugs con perfil escrito por Claude (para el índice). */
export function construirPerfiles(raidsDatos: Raid[], conPerfil: Set<string> = new Set()) {
  const jugadores = new Map<string, Acumulado>();
  for (const d of raidsDatos) {
    const js: any[] = d.jugadores;
    const n = Number(d.resumen.intentos);
    const fds = new Map(js.map((j) => [j.jugador, primeraMuerteMedia(d.detalle[j.jugador]?.muertes)]));
    const fdVals = [...fds.values()].filter((x): x is number => x !== null);
    const grp: Record<string, number | null> = {
      dps: redondeoNet(media(js.map((j) => j.dps))), hps: redondeoNet(media(js.map((j) => j.hps))),
      muertes_intento: redondeoNet(media(js.map((j) => j.muertes)) / Math.max(1, n), 2),
      dano_recibido: redondeoNet(media(js.map((j) => j.dano_recibido))),
      primera_muerte: fdVals.length ? redondeoNet(media(fdVals)) : null,
    };
    const rank = desc(js, (j) => j.dps).map((j) => j.jugador);
    const svs = new Map(js.map((j) => [j.jugador, supervivenciaDe(d.detalle[j.jugador])]));
    const ros = new Map(js.map((j) => [j.jugador, rotacionDe(d.detalle[j.jugador])]));
    const hasSv = [...svs.values()].some(Boolean);
    if (hasSv) {
      grp.mitigados_pct = avg1([...svs.values()].map((s) => s?.mitigados_pct));
      grp.bajo30_pct = avg1([...svs.values()].map((s) => s?.bajo30_pct));
    }
    const rosSi = [...ros.values()].filter(Boolean) as NonNullable<ReturnType<typeof rotacionDe>>[];
    if (rosSi.length) for (const k of CLAVES_ROT) grp[k] = avg1(rosSi.map((r) => r[k]));

    for (const j of js) {
      const nombre: string = j.jugador;
      let p = jugadores.get(nombre);
      if (!p) jugadores.set(nombre, p = { raids: [], skills: new Map(), causes: new Map(), heals: new Map(), healTo: new Map(), mit: new Map(), evi: new Map(), deaths: [], casts: new Map(), buffs: new Map(), vivo: 0 });
      const mates = js.filter((x) => x.clase_id === j.clase_id);
      const cls: Record<string, number | null> = {
        jugadores: mates.length, dps: redondeoNet(media(mates.map((x) => x.dps))), hps: redondeoNet(media(mates.map((x) => x.hps))),
        muertes_intento: redondeoNet(media(mates.map((x) => x.muertes)) / Math.max(1, n), 2),
      };
      if (hasSv) {
        cls.mitigados_pct = avg1(mates.map((x) => svs.get(x.jugador)?.mitigados_pct));
        cls.bajo30_pct = avg1(mates.map((x) => svs.get(x.jugador)?.bajo30_pct));
      }
      if (ros.get(nombre)) for (const k of CLAVES_ROT) cls[k] = avg1(mates.filter((x) => ros.get(x.jugador)).map((x) => ros.get(x.jugador)![k]));
      const det = d.detalle[nombre] ?? {};
      p.raids.push({
        slug: d.meta.slug, fecha: d.meta.fecha, npc: d.meta.npc, jefe: d.meta.jefe, matado: !!d.resumen.matado,
        intentos: d.resumen.intentos, mejor_pct: d.resumen.mejor_pct, grupo: d.meta.grupo.length,
        clase_id: j.clase_id, gs: j.gs, cp: j.cp, dps: j.dps, hps: j.hps, dano_recibido: j.dano_recibido, muertes: j.muertes,
        muertes_intento: redondeoNet(j.muertes / Math.max(1, n), 2),
        primera_muerte: fds.get(nombre) ?? null, crit_pct: j.crit_pct, espalda_pct: j.espalda_pct,
        puesto_dps: rank.indexOf(nombre) + 1,
        grupo_media: grp, clase_media: cls,
        top: (det.habilidades ?? []).slice(0, 3).map((s: any) => ({ habilidad: s.habilidad, pct: s.pct })),
        apoyo: apoyoDe(nombre, det), supervivencia: svs.get(nombre) ?? null, rotacion: ros.get(nombre) ?? null,
      });
      if (det.rotacion) {
        p.vivo += Number(det.rotacion.vivo_s);
        for (const c of det.rotacion.usos_hab ?? []) {
          const e = p.casts.get(c.habilidad) ?? { usos: 0, int: 0 };
          e.usos += Number(c.usos); e.int += Number(c.usos) * Number(c.intervalo_s); // intervalo medio ponderado por usos
          p.casts.set(c.habilidad, e);
        }
        for (const b of det.rotacion.buffs ?? []) { const l = p.buffs.get(b.habilidad) ?? []; l.push(Number(b.activo_pct)); p.buffs.set(b.habilidad, l); }
      }
      for (const s of det.habilidades ?? []) sumar(p.skills, s.habilidad, Number(s.dano));
      if (det.apoyo) {
        for (const h of det.apoyo.cura_hab ?? []) sumar(p.heals, h.habilidad, Number(h.cantidad));
        for (const o of det.apoyo.cura_obj ?? []) sumar(p.healTo, o.jugador, Number(o.cantidad));
      }
      if (det.supervivencia) {
        for (const [k, v] of Object.entries(det.supervivencia.mitigados ?? {})) sumar(p.mit, k, Number(v));
        for (const [k, v] of Object.entries(det.supervivencia.evitados ?? {})) sumar(p.evi, k, Number(v));
        for (const m of det.muertes ?? []) if (m.vida_5s !== null && m.vida_5s !== undefined) {
          p.deaths.push({ slug: d.meta.slug, fecha: d.meta.fecha, intento: m.intento, t: m.t, habilidad: m.habilidad, origen: m.origen,
            golpe_max: m.golpe_max, vida_5s: m.vida_5s, vida_1s: m.vida_1s, dano_5s: m.dano_5s, cura_5s: m.cura_5s });
        }
      }
      for (const m of det.muertes ?? []) {
        const k = `${m.habilidad}|${m.origen}`;
        const c = p.causes.get(k) ?? { habilidad: m.habilidad, origen: m.origen, n: 0, max: 0 };
        c.n++; if (Number(m.golpe_max) > c.max) c.max = Number(m.golpe_max);
        p.causes.set(k, c);
      }
    }
  }

  const perfiles: Record<string, any> = {};
  const indice: any[] = [];
  for (const nombre of [...jugadores.keys()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))) {
    const p = jugadores.get(nombre)!;
    const raids = [...p.raids].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    const last = raids[raids.length - 1];
    const slug = slugJugador(nombre);
    const totSk = Math.max(1, [...p.skills.values()].reduce((s, v) => s + v, 0));
    const skills = desc([...p.skills], ([, v]) => v).slice(0, 8).map(([habilidad, v]) => ({ habilidad, dano: redondeoNet(v), pct: redondeoNet(100 * v / totSk, 1) }));
    // Top 8 causas. perfiles.ps1 desempataba según el orden interno de una tabla hash (arbitrario): aquí, a igual
    // número de muertes, primero el golpe más fuerte y después el id, para que salga siempre lo mismo.
    const causes = [...p.causes.values()]
      .sort((a, b) => b.n - a.n || b.max - a.max || `${a.habilidad}|${a.origen}`.localeCompare(`${b.habilidad}|${b.origen}`))
      .slice(0, 8).map((c) => ({ habilidad: c.habilidad, origen: c.origen, muertes: c.n, golpe_max: redondeoNet(c.max) }));
    const totHeal = Math.max(1, [...p.heals.values()].reduce((s, v) => s + v, 0));
    const totTo = Math.max(1, [...p.healTo.values()].reduce((s, v) => s + v, 0));
    const conDatos = raids.filter((r) => r.supervivencia).length;
    const apoyo = conDatos ? {
      raids: conDatos,
      cura_hab: desc([...p.heals], ([, v]) => v).slice(0, 8).map(([habilidad, v]) => ({ habilidad, cantidad: redondeoNet(v), pct: redondeoNet(100 * v / totHeal, 1) })),
      cura_obj: desc([...p.healTo], ([, v]) => v).map(([jugador, v]) => ({ jugador, cantidad: redondeoNet(v), pct: redondeoNet(100 * v / totTo, 1) })),
    } : null;
    const clave = (x: any) => [x.fecha, x.intento, x.t] as const;
    const supervivencia = conDatos ? {
      raids: conDatos, mitigados: Object.fromEntries(p.mit), evitados: Object.fromEntries(p.evi),
      muertes: p.deaths.map((x, i) => [x, i] as const).sort(([a, ia], [b, ib]) => {
        const [fa, na, ta] = clave(a), [fb, nb, tb] = clave(b);
        return (fa < fb ? 1 : fa > fb ? -1 : 0) || nb - na || tb - ta || ia - ib;
      }).slice(0, 20).map(([x]) => x),
    } : null;
    const conRot = raids.filter((r) => r.rotacion).length;
    const rotacion = conRot ? {
      raids: conRot,
      usos_hab: desc([...p.casts], ([, v]) => v.usos).slice(0, 12).map(([habilidad, v]) => ({
        habilidad, usos: redondeoNet(v.usos), usos_min: redondeoNet(60 * v.usos / Math.max(1, p.vivo), 1), intervalo_s: redondeoNet(v.int / Math.max(1, v.usos), 1),
      })),
      buffs: desc([...p.buffs].map(([habilidad, l]) => ({ habilidad, activo_pct: redondeoNet(media(l), 1), raids: l.length })), (b) => b.activo_pct).slice(0, 8),
    } : null;
    const totalTries = raids.reduce((s, r) => s + r.intentos, 0);
    const muertesTot = raids.reduce((s, r) => s + r.muertes, 0);
    const data = {
      nombre, slug, clase_id: last.clase_id,
      resumen: {
        raids: raids.length, kills: raids.filter((r) => r.matado).length, intentos: totalTries,
        dps_medio: redondeoNet(media(raids.map((r) => r.dps))), hps_medio: redondeoNet(media(raids.map((r) => r.hps))),
        muertes: muertesTot, muertes_intento: redondeoNet(muertesTot / Math.max(1, totalTries), 2),
        gs: last.gs, cp: last.cp, primera: raids[0].fecha, ultima: last.fecha,
      },
      raids, habilidades: skills, causas: causes, apoyo, supervivencia, rotacion,
    };
    // perfiles.ps1 escribía con Write-Json, que convierte en null cualquier objeto vacío ("x":{} → "x":null)
    perfiles[nombre] = JSON.parse(JSON.stringify(data).replace(/":\{\}/g, '":null'));
    indice.push({ slug, nombre, clase_id: last.clase_id, raids: raids.length, kills: data.resumen.kills, dps_medio: data.resumen.dps_medio,
      hps_medio: data.resumen.hps_medio, muertes_intento: data.resumen.muertes_intento, gs: last.gs, ultima: last.fecha, perfil: conPerfil.has(slug) });
  }
  indice.sort((a, b) => b.raids - a.raids || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  return { perfiles, indice };
}
