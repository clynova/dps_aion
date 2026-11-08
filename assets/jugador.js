// Perfil de un jugador: lee data.json (generado por tools/perfiles.ps1), el perfil escrito por Claude
// (perfil.json / perfil.en.json) y los nombres del idioma elegido. El «perfil automático» se calcula aquí.
(async function () {
  const T = I18N.t, LANG = I18N.lang, LOC = I18N.locale;
  const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
  let D, P, N, IDX;
  try {
    [D, P, N, IDX] = await Promise.all([
      get('data.json'),
      (LANG === 'es' ? get('perfil.json') : get(`perfil.${LANG}.json`).catch(() => get('perfil.json'))).catch(() => null),
      (LANG === 'es' ? get('../../nombres.json') : get(`../../nombres.${LANG}.json`).catch(() => get('../../nombres.json'))).catch(() => ({})),
      get('../index.json').catch(() => [])
    ]);
  } catch (e) {
    document.getElementById('eyebrow').textContent = T('raid.loadError');
    return;
  }
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const nf = new Intl.NumberFormat(LOC, { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(LOC, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat(LOC, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const cmp = new Intl.NumberFormat(LOC, { notation: 'compact', maximumFractionDigits: 1 });
  const int = (v) => nf.format(Number(v));
  const pct = (v) => nf1.format(Number(v)) + (LANG === 'es' ? ' %' : '%');
  const k = (v) => nf.format(Math.round(Number(v) / 1000)) + 'k';
  const q = (s) => T('q.open') + s + T('q.close');
  const ONE_SHOT = 100000;
  const skName = (id) => (id ? ((N.apodos || {})[id] || (N.habilidades || {})[id] || String(id)) : T('nodata'));
  const npcName = (id, fb) => (N.npcs || {})[id] || fb;
  const orgName = (o, raidNpc) => (o === 'jefe' ? T('pl.th.boss') : o ? ((N.npcs || {})[o] || T('npc', { id: o })) : T('unknownOrigin'));
  const iconUrl = (id) => { const p = (N.iconos || {})[id]; return p ? `https://cdn.questlog.gg/aion-2/assets/Game/UI/Resource/Texture/${p}.webp` : null; };
  const idLabel = (id) => ((N.apodos || {})[id] || (N.habilidades || {})[id] ? skName(id) : (N.npcs || {})[id] ? (N.npcs || {})[id] : null);
  const rich = (node, text) => {
    const named = String(text || '').replace(/\b\d{6,8}\b/g, (m) => { const l = idLabel(m); return l ? q(l) : m; });
    named.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) node.append(el('b', null, part.slice(2, -2)));
      else if (part) node.append(document.createTextNode(part));
    });
    return node;
  };
  const R = D.resumen;
  const raids = D.raids.slice().sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  raids.forEach((r) => { r.jefe = npcName(r.npc, r.jefe); r.when = new Date(r.fecha); });
  const shortDate = (d) => d.toLocaleDateString(LOC, { day: 'numeric', month: 'numeric' }) + ' ' + d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
  const className = T('class.' + D.clase_id);
  const mean = (arr, f) => d3.mean(arr, f);

  // ---------- Cabecera y cifras ----------
  document.title = `${D.nombre} · ${T('site.name')}`;
  $('eyebrow').textContent = T('pl.eyebrow', { clase: className });
  $('nombre').textContent = D.nombre;
  $('lede').textContent = T('pl.lede', { n: int(R.raids), raids: T(R.raids === 1 ? 'pl.raid1' : 'pl.raidN'),
    desde: new Date(R.primera).toLocaleDateString(LOC, { day: 'numeric', month: 'long' }), k: int(R.kills), dps: cmp.format(R.dps_medio) });
  const vsWord = (ratio) => (Math.abs(ratio - 1) < 0.03 ? T('pl.vs.avg') : T(ratio > 1 ? 'pl.vs.above' : 'pl.vs.below', { p: nf.format(Math.abs(ratio - 1) * 100) }));
  const ratioDps = mean(raids, (r) => r.dps / r.grupo_media.dps);
  const ratioHps = mean(raids, (r) => r.hps / Math.max(1, r.grupo_media.hps));
  const ratioDpa = mean(raids, (r) => r.muertes_intento / Math.max(0.01, r.grupo_media.muertes_intento));
  const ratioTaken = mean(raids, (r) => r.dano_recibido / Math.max(1, r.grupo_media.dano_recibido));
  const withFirst = raids.filter((r) => r.primera_muerte != null && r.grupo_media.primera_muerte != null);
  const myFirst = mean(withFirst, (r) => r.primera_muerte), grpFirst = mean(withFirst, (r) => r.grupo_media.primera_muerte);
  const grpDpa = mean(raids, (r) => r.grupo_media.muertes_intento);
  const tile = (label, value, note, cls) => {
    const t = el('div', 'rx-tile');
    t.append(el('span', 'rx-tile-label', label), el('span', 'rx-tile-value' + (cls ? ' ' + cls : ''), value));
    if (note) t.append(el('span', 'rx-tile-note', note));
    $('tiles').append(t);
  };
  tile(T('pl.tile.raids'), int(R.raids), T('pl.tile.raids.note', { k: int(R.kills), t: int(R.intentos) }));
  tile(T('pl.tile.dps'), cmp.format(R.dps_medio), vsWord(ratioDps));
  tile(T('pl.tile.hps'), int(R.hps_medio), vsWord(ratioHps));
  tile(T('pl.tile.dpa'), nf2.format(R.muertes_intento), vsWord(ratioDpa));
  if (myFirst != null) tile(T('pl.tile.first'), int(myFirst) + ' s', T('pl.tile.first.note', { g: int(grpFirst) }));
  tile(T('pl.tile.gear'), `GS ${int(R.gs)}`, `CP ${int(R.cp)}`);

  // ---------- Perfil automático ----------
  const good = [], bad = [], trend = [];
  const rankMode = d3.mode(raids, (r) => r.puesto_dps);
  const rankTxt = T('pl.ordinal', { r: rankMode });
  if (ratioHps >= 2.5) good.push(T('ins.healer', { hps: int(R.hps_medio), x: nf1.format(ratioHps) }));
  if (D.clase_id === 'templar' || ratioTaken >= 1.4) good.push(T('ins.tank', { x: nf1.format(ratioTaken) }));
  if (ratioDps >= 1.08) good.push(T('ins.dps.up', { p: nf.format((ratioDps - 1) * 100), rank: rankTxt }));
  else if (ratioDps <= 0.92) bad.push(T('ins.dps.down', { p: nf.format((1 - ratioDps) * 100), rank: rankTxt }));
  if (myFirst != null && grpFirst != null) {
    if (myFirst >= grpFirst + 12) good.push(T('ins.surv.up', { a: int(myFirst), g: int(grpFirst) }));
    else if (myFirst <= grpFirst - 12) bad.push(T('ins.surv.down', { a: int(myFirst), g: int(grpFirst) }));
  }
  if (ratioDpa <= 0.88) good.push(T('ins.dpa.up', { a: nf2.format(R.muertes_intento), g: nf2.format(grpDpa) }));
  else if (ratioDpa >= 1.12) bad.push(T('ins.dpa.down', { a: nf2.format(R.muertes_intento), g: nf2.format(grpDpa) }));
  const back = mean(raids, (r) => r.espalda_pct), crit = mean(raids, (r) => r.crit_pct);
  if (back >= 55) good.push(T('ins.back', { p: pct(back) }));
  if (crit >= 50) good.push(T('ins.crit', { p: pct(crit) }));
  const top = (D.habilidades || [])[0];
  if (top && top.pct >= 35) bad.push(T('ins.skill', { s: q(skName(top.habilidad)), p: pct(top.pct) }));
  const totalDeaths = d3.sum(D.causas || [], (c) => c.muertes) || R.muertes;
  const unknown = (D.causas || []).find((c) => !c.habilidad && !c.origen);
  const known = (D.causas || []).filter((c) => c.habilidad);
  if (known[0]) bad.push(T('ins.cause', { s: q(skName(known[0].habilidad)), n: int(known[0].muertes), t: int(R.muertes) }));
  if (unknown && unknown.muertes / Math.max(1, R.muertes) >= 0.25) bad.push(T('ins.cause.unknown', { n: int(unknown.muertes), t: int(R.muertes) }));
  const gsAll = (IDX || []).map((p) => p.gs).filter(Boolean);
  if (gsAll.length >= 4 && R.gs === d3.min(gsAll)) bad.push(T('ins.gear.low', { gs: int(R.gs) }));
  if (gsAll.length >= 4 && R.gs === d3.max(gsAll)) good.push(T('ins.gear.high', { gs: int(R.gs) }));
  if (raids.length >= 2) {
    const a = raids[0], b = raids[raids.length - 1];
    const d = (b.dps - a.dps) / a.dps * 100;
    trend.push(T('ins.trend.dps', { a: cmp.format(a.dps), b: cmp.format(b.dps), d: (d >= 0 ? '+' : '−') + nf.format(Math.abs(d)) + (LANG === 'es' ? ' %' : '%') }));
    if (a.primera_muerte != null && b.primera_muerte != null) trend.push(T('ins.trend.first', { a: int(a.primera_muerte), b: int(b.primera_muerte) }));
  } else trend.push(T('ins.oneRaid'));
  const fill = (id, items) => { const ul = $(id); (items.length ? items : [T('ins.none')]).forEach((s) => ul.append(el('li', null, s))); };
  fill('a-good', good); fill('a-bad', bad); fill('a-trend', trend);

  // ---------- Perfil escrito por Claude ----------
  if (!P) $('c-pending').hidden = false;
  else {
    const body = $('c-body');
    if (P.resumen) body.append(rich(el('p', 'pl-summary'), P.resumen));
    [['fortalezas', 'pl.claude.good', 'pl-good'], ['mejorar', 'pl.claude.improve', 'pl-bad'], ['recomendaciones', 'pl.claude.reco', '']].forEach(([key, label, cls]) => {
      const items = P[key] || []; if (!items.length) return;
      const sub = el('div', 'rx-sub'); sub.append(el('h4', cls, T(label)));
      const ul = el('ul', 'rx-reco'); items.forEach((s) => ul.append(rich(el('li'), s))); sub.append(ul); body.append(sub);
    });
    if (P.actualizado) body.append(el('p', 'rx-note', T('pl.claude.updated', { d: new Date(P.actualizado).toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: 'numeric' }), n: int(P.raids || R.raids) })));
  }

  // ---------- Gráficos ----------
  const tipFor = (box) => {
    const t = el('div', 'rx-tip'); t.hidden = true; box.append(t);
    return {
      show(head, lines, x, y) {
        t.replaceChildren(el('div', 'rx-tip-head', head), ...lines.map((l) => el('div', null, l)));
        t.hidden = false;
        const bw = box.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
        let left = x + 12; if (left + tw > bw) left = Math.max(0, x - tw - 12);
        let top = y - th - 8; if (top < 0) top = y + 12;
        t.style.left = left + 'px'; t.style.top = top + 'px';
      },
      hide() { t.hidden = true; }
    };
  };
  const svgIn = (box, W, H, label) => d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', label);
  const measure = (svg, labels) => { const g = svg.append('g').attr('opacity', 0); const w = d3.max(labels, (s) => g.append('text').text(s).node().getComputedTextLength()) || 0; g.remove(); return w; };
  const width = (box) => Math.max(box.clientWidth, 260);
  const raidHead = (r) => `${shortDate(r.when)} · ${r.jefe}`;
  const goRaid = (r) => { location.href = `../../raids/${r.slug}/#${encodeURIComponent(D.nombre)}`; };

  function drawDps(box) {
    const W = width(box), H = 240, m = { t: 14, r: 10, b: 30, l: 44 };
    const svg = svgIn(box, W, H, T('pl.chart.dps'));
    const x = d3.scaleBand(raids.map((r) => r.slug), [m.l, W - m.r]).padding(0.3);
    const y = d3.scaleLinear([0, d3.max(raids, (r) => Math.max(r.dps, r.grupo_media.dps)) * 1.1], [H - m.b, m.t]).nice();
    y.ticks(4).forEach((v) => {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).style('stroke', v ? 'var(--chart-grid)' : 'var(--chart-axis)');
      svg.append('text').attr('x', m.l - 6).attr('y', y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text(k(v));
    });
    raids.forEach((r) => svg.append('text').attr('x', x(r.slug) + x.bandwidth() / 2).attr('y', H - m.b + 16).attr('text-anchor', 'middle').text(r.when.toLocaleDateString(LOC, { day: 'numeric', month: 'numeric' })));
    const t = tipFor(box);
    svg.append('g').selectAll('rect').data(raids).join('rect')
      .attr('x', (r) => x(r.slug)).attr('width', x.bandwidth()).attr('y', (r) => y(r.dps)).attr('height', (r) => y(0) - y(r.dps)).attr('rx', 3)
      .style('fill', (r) => (r.matado ? 'var(--ok)' : 'var(--series-1)')).style('fill-opacity', 0.85).style('cursor', 'pointer')
      .on('pointermove', (ev, r) => { const [px, py] = d3.pointer(ev, box); t.show(raidHead(r), [T('pl.tip.dps', { v: int(r.dps) }), T('pl.tip.grp', { v: int(r.grupo_media.dps) }), T('pl.rank', { r: r.puesto_dps, n: r.grupo })], px, py); })
      .on('pointerleave', () => t.hide()).on('click', (ev, r) => goRaid(r));
    svg.append('path').datum(raids).attr('d', d3.line().x((r) => x(r.slug) + x.bandwidth() / 2).y((r) => y(r.grupo_media.dps)))
      .style('fill', 'none').style('stroke', 'var(--series-2)').style('stroke-width', 2).style('stroke-linejoin', 'round').style('pointer-events', 'none');
    svg.append('g').selectAll('circle').data(raids).join('circle').attr('cx', (r) => x(r.slug) + x.bandwidth() / 2).attr('cy', (r) => y(r.grupo_media.dps)).attr('r', 3)
      .style('fill', 'var(--series-2)').style('pointer-events', 'none');
  }

  function drawSurv(box) {
    const rows = raids.filter((r) => r.grupo_media.primera_muerte != null);
    const W = width(box), row = 30, m = { t: 6, r: 16, b: 28 };
    const H = m.t + m.b + rows.length * row;
    const svg = svgIn(box, W, H, T('pl.chart.surv'));
    const labels = rows.map((r) => shortDate(r.when));
    m.l = Math.ceil(measure(svg, labels)) + 12;
    const maxT = d3.max(rows, (r) => Math.max(r.primera_muerte || 0, r.grupo_media.primera_muerte));
    const x = d3.scaleLinear([0, maxT * 1.1], [m.l, W - m.r]).nice();
    const y = d3.scaleBand(rows.map((r) => r.slug), [m.t, H - m.b]).padding(0.3);
    x.ticks(W < 420 ? 4 : 6).forEach((v) => {
      svg.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--chart-grid)');
      svg.append('text').attr('x', x(v)).attr('y', H - m.b + 16).attr('text-anchor', 'middle').text(v + ' s');
    });
    const t = tipFor(box);
    rows.forEach((r, i) => {
      const cy = y(r.slug) + y.bandwidth() / 2;
      svg.append('text').attr('x', m.l - 8).attr('y', cy).attr('dy', '0.32em').attr('text-anchor', 'end').text(labels[i]);
      const g = svg.append('g').style('cursor', 'pointer')
        .on('pointermove', (ev) => { const [px, py] = d3.pointer(ev, box); t.show(raidHead(r), [r.primera_muerte != null ? T('pl.tip.first', { v: int(r.primera_muerte) }) : T('pl.tip.nofirst'), T('pl.tip.grpfirst', { v: int(r.grupo_media.primera_muerte) })], px, py); })
        .on('pointerleave', () => t.hide()).on('click', () => goRaid(r));
      g.append('rect').attr('x', m.l).attr('y', y(r.slug)).attr('width', W - m.l - m.r).attr('height', y.bandwidth()).style('fill', 'transparent');
      if (r.primera_muerte != null) {
        const better = r.primera_muerte >= r.grupo_media.primera_muerte;
        g.append('line').attr('x1', x(r.grupo_media.primera_muerte)).attr('x2', x(r.primera_muerte)).attr('y1', cy).attr('y2', cy)
          .style('stroke', better ? 'var(--ok)' : 'var(--critical)').style('stroke-width', 3).style('stroke-linecap', 'round');
      }
      g.append('circle').attr('cx', x(r.grupo_media.primera_muerte)).attr('cy', cy).attr('r', 5).style('fill', 'var(--chart-muted)');
      if (r.primera_muerte != null) g.append('circle').attr('cx', x(r.primera_muerte)).attr('cy', cy).attr('r', 5.5).style('fill', 'var(--series-1)');
    });
  }

  const hbars = (box, rows, { label, value, valueText, critical, tip, icon }) => {
    if (!rows.length) { box.append(el('div', 'rx-empty', T('chart.noData'))); return; }
    const withIcons = icon && rows.some((d) => icon(d));
    const IC = 18, ICG = 6;
    const W = width(box), row = withIcons ? 24 : 22, m = { t: 2, r: 48, b: 2 };
    const H = m.t + m.b + rows.length * row;
    const svg = svgIn(box, W, H, '');
    m.l = Math.min(W * 0.55, Math.ceil(measure(svg, rows.map(label))) + 10 + (withIcons ? IC + ICG : 0));
    const x = d3.scaleLinear([0, d3.max(rows, value) || 1], [m.l, W - m.r]);
    const y = d3.scaleBand(rows.map((_, i) => i), [m.t, H - m.b]).padding(0.25);
    const t = tipFor(box);
    const g = svg.append('g').selectAll('g').data(rows).join('g');
    g.append('text').attr('x', m.l - 8 - (withIcons ? IC + ICG : 0)).attr('y', (d, i) => y(i) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
      .attr('class', (d) => (critical && critical(d) ? 'rx-strong' : null)).text(label);
    if (withIcons) g.filter((d) => icon(d)).append('image').attr('href', (d) => icon(d)).attr('x', m.l - ICG - IC).attr('y', (d) => y(rows.indexOf(d)) + y.bandwidth() / 2 - IC / 2)
      .attr('width', IC).attr('height', IC).on('error', function () { this.remove(); });
    g.append('rect').attr('x', m.l).attr('y', (d, i) => y(i)).attr('height', y.bandwidth()).attr('width', (d) => Math.max(1, x(value(d)) - m.l)).attr('rx', 3)
      .style('fill', (d) => (critical && critical(d) ? 'var(--critical)' : 'var(--chart-muted)'))
      .on('pointermove', (ev, d) => { const [px, py] = d3.pointer(ev, box); t.show(label(d), tip(d), px, py); }).on('pointerleave', () => t.hide());
    g.append('text').attr('x', (d) => x(value(d)) + 5).attr('y', (d, i) => y(i) + y.bandwidth() / 2).attr('dy', '0.32em').text(valueText);
  };
  const drawSkills = (box) => hbars(box, D.habilidades || [], { label: (d) => skName(d.habilidad), value: (d) => d.pct, valueText: (d) => pct(d.pct), icon: (d) => iconUrl(d.habilidad),
    tip: (d) => [T('tip.dmg', { d: cmp.format(d.dano), p: pct(d.pct) }), T('tip.skillno', { id: d.habilidad })] });
  const drawCauses = (box) => hbars(box, D.causas || [], {
    label: (d) => (d.habilidad || d.origen ? `${skName(d.habilidad)} · ${orgName(d.origen)}` : T('nodata')),
    value: (d) => d.muertes, valueText: (d) => int(d.muertes), critical: (d) => d.golpe_max >= ONE_SHOT,
    tip: (d) => [T('tip.deaths', { n: int(d.muertes) }), T('tip.maxhit', { n: int(d.golpe_max) }), d.habilidad ? T('tip.skillno', { id: d.habilidad }) : T('tip.noskill')] });

  function drawTable() {
    const tb = $('tabla'); tb.replaceChildren();
    raids.slice().reverse().forEach((r) => {
      const tr = el('tr'); tr.dataset.jugador = r.slug; tr.tabIndex = 0;
      const td = (text, cls) => tr.appendChild(el('td', cls, text));
      td(r.when.toLocaleDateString(LOC, { day: 'numeric', month: 'short' }) + ' ' + r.when.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }));
      td(r.jefe);
      const res = el('td', 'rx-left'); res.append(el('span', 'rx-pill' + (r.matado ? ' is-ok' : ''), r.matado ? T('home.stat.kill') : pct(r.mejor_pct))); tr.append(res);
      td(int(r.dps)); td(T('pl.rank', { r: r.puesto_dps, n: r.grupo }), 'rx-opt'); td(int(r.hps)); td(int(r.muertes));
      td(r.primera_muerte != null ? int(r.primera_muerte) + ' s' : '—', 'rx-opt'); td(int(r.gs), 'rx-opt');
      tr.addEventListener('click', () => goRaid(r));
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') goRaid(r); });
      tb.append(tr);
    });
  }

  const charts = [['ch-dps', drawDps], ['ch-surv', drawSurv], ['ch-skills', drawSkills], ['ch-causes', drawCauses]];
  const drawAll = () => { charts.forEach(([id, fn]) => { const b = $(id); b.replaceChildren(); fn(b); }); drawTable(); };
  drawAll();
  $('foot').textContent = T('pl.foot', { d: new Date(D.actualizado).toLocaleString(LOC), n: int(R.raids) });
  let lastW = innerWidth, timer;
  addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; drawAll(); } }, 150); });
})();
