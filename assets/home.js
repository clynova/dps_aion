// Página principal: lista de raids (raids/index.json) y evolución del mejor intento por jefe.
(async function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const nf = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('es', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const cmp = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });
  let raids;
  try { raids = await fetch('raids/index.json', { cache: 'no-cache' }).then((r) => r.json()); }
  catch (e) { $('lede').textContent = 'Todavía no hay raids guardadas.'; return; }
  const N = await fetch('nombres.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({}));
  const npcName = (npc, fallback) => (N.npcs || {})[npc] || fallback;
  raids.forEach((r) => { r.jefe = npcName(r.npc, r.jefe); (r.otros || []).forEach((o) => { o.jefe = npcName(o.npc, o.jefe); }); });
  raids.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const kills = raids.filter((r) => r.matado).length;
  $('lede').textContent = `${nf.format(raids.length)} ${raids.length === 1 ? 'raid guardada' : 'raids guardadas'}, ${nf.format(kills)} con kill del jefe principal. Pulsa una para ver sus estadísticas, la ficha de cada jugador y las recomendaciones.`;

  raids.forEach((r) => {
    const d = new Date(r.fecha);
    const li = el('li', 'hm-item'); const a = el('a'); a.href = `raids/${r.slug}/`;
    const left = el('div');
    left.append(el('div', 'hm-name', r.jefe));
    const sub = el('div', 'hm-sub');
    sub.append(el('span', null, d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })));
    (r.otros || []).forEach((o) => sub.append(el('span', null, `${o.jefe}: ${o.matado ? 'matado' : 'sin kill'}`)));
    const pill = el('span', 'rx-pill' + (r.analizado ? ' is-ok' : ' is-pending'), r.analizado ? 'Analizada' : 'Análisis pendiente');
    sub.append(pill);
    left.append(sub);
    const stats = el('div', 'hm-stats');
    const stat = (v, l, ok) => { const s = el('div', 'hm-stat'); s.append(el('b', ok ? 'is-ok' : null, v), el('span', null, l)); stats.append(s); };
    stat(r.matado ? 'Kill' : nf1.format(r.mejor_pct) + ' %', r.matado ? 'jefe matado' : 'mejor intento', r.matado);
    stat(nf.format(r.intentos), 'intentos');
    stat(nf.format(r.muertes), 'muertes');
    stat(cmp.format(r.dps_grupo_medio), 'DPS medio');
    a.append(left, stats); li.append(a); $('lista').append(li);
  });

  // Evolución: solo para jefes con 2 o más noches
  const porJefe = d3.groups(raids, (r) => r.jefe).filter(([, v]) => v.length > 1);
  if (!porJefe.length) return;
  $('evolucion').hidden = false;
  const draw = () => {
    const box = $('ch-evolucion'); box.replaceChildren();
    const rows = porJefe.flatMap(([jefe, v]) => v.map((r) => ({ ...r, jefe, x: new Date(r.fecha), y: r.matado ? 100 : r.mejor_pct })));
    const W = Math.max(box.clientWidth, 260), H = 240, m = { t: 16, r: 16, b: 30, l: 40 };
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Evolución del mejor intento por jefe');
    const x = d3.scaleUtc(d3.extent(rows, (d) => d.x), [m.l, W - m.r]);
    const y = d3.scaleLinear([0, 100], [H - m.b, m.t]);
    [0, 25, 50, 75, 100].forEach((v) => {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).style('stroke', v ? 'var(--chart-grid)' : 'var(--chart-axis)');
      svg.append('text').attr('x', m.l - 6).attr('y', y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text(v + ' %');
    });
    x.ticks(W < 420 ? 3 : 6).forEach((v) => svg.append('text').attr('x', x(v)).attr('y', H - m.b + 16).attr('text-anchor', 'middle').text(v.toLocaleDateString('es', { day: 'numeric', month: 'short' })));
    const colors = ['var(--series-1)', 'var(--series-2)', 'var(--fg-muted)'];
    porJefe.forEach(([jefe], i) => {
      const pts = rows.filter((r) => r.jefe === jefe).sort((a, b) => a.x - b.x);
      svg.append('path').datum(pts).attr('d', d3.line().x((d) => x(d.x)).y((d) => y(d.y))).style('fill', 'none').style('stroke', colors[i % 3]).style('stroke-width', 2).style('stroke-linejoin', 'round').style('stroke-linecap', 'round');
      svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (d) => x(d.x)).attr('cy', (d) => y(d.y)).attr('r', 4)
        .style('fill', (d) => (d.matado ? 'var(--ok)' : colors[i % 3])).style('cursor', 'pointer')
        .on('click', (ev, d) => { location.href = `raids/${d.slug}/`; })
        .append('title').text((d) => `${d.jefe} · ${d.x.toLocaleDateString('es')} · ${d.matado ? 'kill' : nf1.format(d.mejor_pct) + ' %'}`);
      const last = pts[pts.length - 1];
      svg.append('text').attr('x', x(last.x) - 6).attr('y', y(last.y) - 9).attr('text-anchor', 'end').attr('class', 'rx-strong').text(jefe);
    });
  };
  draw();
  let lw = innerWidth; addEventListener('resize', () => { if (innerWidth !== lw) { lw = innerWidth; draw(); } });
})();
