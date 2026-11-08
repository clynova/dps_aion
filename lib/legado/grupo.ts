/* eslint-disable */
// @ts-nocheck -- port directo de assets/home.js (portada de la web estática), ahora página de cada grupo. Mismo código
// de dibujo; solo cambia la entrada: raids y jugadores llegan como parámetros (desde la base). Ver docs/adr/0003.
// `conSolicitud`: el botón «solicitar análisis» se activa en la fase 8, cuando exista /api/solicitar en la app nueva.
import * as d3 from 'd3';

/** Dibuja la lista de raids, los jugadores y la evolución por jefe. Devuelve la función que lo desmonta. */
export function montarGrupo({ raids, jugadores, N, T, LANG, LOC, rutaRaid, rutaJugador, conSolicitud }) {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const nf = new Intl.NumberFormat(LOC, { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(LOC, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const cmp = new Intl.NumberFormat(LOC, { notation: 'compact', maximumFractionDigits: 1 });
  const pct = (v) => nf1.format(v) + (LANG === 'es' ? ' %' : '%');
  if (!raids.length) { $('lede').textContent = T('home.empty'); return () => {}; }
  const npcName = (npc, fallback) => (N.npcs || {})[npc] || fallback;
  raids.forEach((r) => { r.jefe = npcName(r.npc, r.jefe); (r.otros || []).forEach((o) => { o.jefe = npcName(o.npc, o.jefe); }); });
  raids.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const kills = raids.filter((r) => r.matado).length;
  $('lede').textContent = T('home.lede', { n: nf.format(raids.length), raids: T(raids.length === 1 ? 'home.raid1' : 'home.raidN'), k: nf.format(kills) });

  raids.forEach((r) => {
    const d = new Date(r.fecha);
    const li = el('li', 'hm-item'); const a = el('a'); a.href = rutaRaid(r.slug);
    const left = el('div');
    left.append(el('div', 'hm-name', r.jefe));
    const sub = el('div', 'hm-sub');
    sub.append(el('span', null, d.toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' })));
    (r.otros || []).forEach((o) => sub.append(el('span', null, `${o.jefe}: ${T(o.matado ? 'home.killed' : 'home.nokill')}`)));
    sub.append(el('span', 'rx-pill' + (r.analizado ? ' is-ok' : ' is-pending'), T(r.analizado ? 'home.analyzed' : 'home.pending')));
    left.append(sub);
    const stats = el('div', 'hm-stats');
    const stat = (v, l, ok) => { const s = el('div', 'hm-stat'); s.append(el('b', ok ? 'is-ok' : null, v), el('span', null, l)); stats.append(s); };
    stat(r.matado ? T('home.stat.kill') : pct(r.mejor_pct), T(r.matado ? 'home.stat.killed' : 'home.stat.best'), r.matado);
    stat(nf.format(r.intentos), T('home.stat.tries'));
    stat(nf.format(r.muertes), T('home.stat.deaths'));
    stat(cmp.format(r.dps_grupo_medio), T('home.stat.dps'));
    a.append(left, stats); li.append(a); $('lista').append(li);
  });

  // Jugadores: los 5 con más raids (empate: el que jugó más recientemente) y un buscador para el resto
  const players = jugadores.slice();
  if (players.length) {
    $('jugadores').hidden = false;
    players.sort((a, b) => b.raids - a.raids || new Date(b.ultima) - new Date(a.ultima) || a.nombre.localeCompare(b.nombre));
    const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    // Botón de los resultados de búsqueda: avisa en Discord (api/solicitar.js) de que alguien quiere el análisis de su perfil
    const pedido = (slug) => { try { return localStorage.getItem('solicitud:' + slug); } catch (e) { return null; } };
    const request = (p) => {
      const b = el('button', 'hm-request'); b.type = 'button';
      const sent = () => { b.disabled = true; b.textContent = T('home.players.sent'); };
      if (pedido(p.slug)) { sent(); return b; }
      b.textContent = T('home.players.request');
      b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = T('home.players.sending');
        const r = await fetch('/api/solicitar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: p.slug }) }).catch(() => null);
        if (r && r.ok) { try { localStorage.setItem('solicitud:' + p.slug, new Date().toISOString()); } catch (e) { /* sin almacenamiento */ } sent(); }
        else { b.disabled = false; b.textContent = T('home.players.error'); }
      });
      return b;
    };
    const show = (list, withRequest) => $('lista-jugadores').replaceChildren(...list.map((p) => {
      const li = el('li', 'hm-player'); const a = el('a'); a.href = rutaJugador(p.slug);
      a.append(el('span', 'hm-name', p.nombre), el('span', 'hm-sub', `${T('class.' + p.clase_id)} · ${nf.format(p.raids)} ${T(p.raids === 1 ? 'pl.raid1' : 'pl.raidN')} · ${cmp.format(p.dps_medio)} DPS`));
      li.append(a); if (withRequest && conSolicitud) li.append(request(p)); return li;
    }));
    const search = () => {
      const q = $('buscar-jugador').value.trim(), state = $('buscar-estado');
      if (!q) { state.hidden = true; show(players.slice(0, 5)); return; }
      const found = players.filter((p) => fold(p.nombre).includes(fold(q)));
      state.hidden = false;
      state.textContent = found.length ? T(found.length === 1 ? 'home.players.found1' : 'home.players.foundN', { n: nf.format(found.length) }) : T('home.players.none', { q });
      show(found, true);
    };
    $('buscar-jugador').addEventListener('input', search);
    search();
  }

  // Evolución: solo para jefes con 2 o más noches
  const porJefe = d3.groups(raids, (r) => r.jefe).filter(([, v]) => v.length > 1);
  if (!porJefe.length) return () => {};
  $('evolucion').hidden = false;
  const draw = () => {
    const box = $('ch-evolucion'); box.replaceChildren();
    const rows = porJefe.flatMap(([jefe, v]) => v.map((r) => ({ ...r, jefe, x: new Date(r.fecha), y: r.matado ? 100 : r.mejor_pct })));
    const W = Math.max(box.clientWidth, 260), H = 240, m = { t: 16, r: 16, b: 30, l: 40 };
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', T('home.evolution'));
    const x = d3.scaleUtc(d3.extent(rows, (d) => d.x), [m.l, W - m.r]);
    const y = d3.scaleLinear([0, 100], [H - m.b, m.t]);
    [0, 25, 50, 75, 100].forEach((v) => {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).style('stroke', v ? 'var(--chart-grid)' : 'var(--chart-axis)');
      svg.append('text').attr('x', m.l - 6).attr('y', y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text(v + (LANG === 'es' ? ' %' : '%'));
    });
    x.ticks(W < 420 ? 3 : 6).forEach((v) => svg.append('text').attr('x', x(v)).attr('y', H - m.b + 16).attr('text-anchor', 'middle')
      .text(v.toLocaleDateString(LOC, { day: 'numeric', month: 'short' }) + ' ' + v.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' })));
    const colors = ['var(--series-1)', 'var(--series-2)', 'var(--fg-muted)'];
    porJefe.forEach(([jefe], i) => {
      const pts = rows.filter((r) => r.jefe === jefe).sort((a, b) => a.x - b.x);
      svg.append('path').datum(pts).attr('d', d3.line().x((d) => x(d.x)).y((d) => y(d.y))).style('fill', 'none').style('stroke', colors[i % 3]).style('stroke-width', 2).style('stroke-linejoin', 'round').style('stroke-linecap', 'round');
      svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (d) => x(d.x)).attr('cy', (d) => y(d.y)).attr('r', 4)
        .style('fill', (d) => (d.matado ? 'var(--ok)' : colors[i % 3])).style('cursor', 'pointer')
        .on('click', (ev, d) => { location.href = rutaRaid(d.slug); })
        .append('title').text((d) => `${d.jefe} · ${d.x.toLocaleString(LOC)} · ${d.matado ? T('home.stat.kill') : pct(d.mejor_pct)}`);
      const last = pts[pts.length - 1];
      svg.append('text').attr('x', x(last.x) - 6).attr('y', y(last.y) - 9).attr('text-anchor', 'end').attr('class', 'rx-strong').text(jefe);
    });
  };
  draw();
  let lw = innerWidth;
  const alCambiarTamano = () => { if (innerWidth !== lw) { lw = innerWidth; draw(); } };
  addEventListener('resize', alCambiarTamano);
  return () => removeEventListener('resize', alCambiarTamano);
}
