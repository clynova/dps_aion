// Página de una raid: lee data.json (estadísticas), analisis.json (texto de Claude) y nombres.json.
(async function () {
  const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
  let D, A, N;
  try {
    [D, A, N] = await Promise.all([
      get('data.json'),
      get('analisis.json').catch(() => ({ pendiente: true })),
      get('../../nombres.json').catch(() => ({}))
    ]);
  } catch (e) {
    document.getElementById('eyebrow').textContent = 'No se pudieron cargar los datos de esta raid.';
    return;
  }
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const nf = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('es', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const cmp = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });
  const int = (v) => nf.format(Number(v));
  const pct = (v) => nf1.format(Number(v)) + ' %';
  const compact = (v) => cmp.format(Number(v));
  const k = (v) => nf.format(Math.round(Number(v) / 1000)) + 'k';
  const ONE_SHOT = Number(A.one_shot) || 100000;
  const zonas = A.zonas || {};
  const skName = (id) => (id ? ((N.habilidades || {})[id] || id) : 'Sin dato');
  const orgName = (o) => (o === 'jefe' ? D.meta.jefe : o ? ((N.npcs || {})[o] || `Add ${o}`) : 'origen desconocido');
  const M = D.meta, R = D.resumen;
  const npcName = (npc, fallback) => (N.npcs || {})[npc] || fallback;
  M.jefe = npcName(M.npc, M.jefe);
  (D.otros || []).forEach((o) => { o.jefe = npcName(o.npc, o.jefe); });
  const fecha = new Date(M.fecha);
  const fechaTxt = fecha.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });

  // Texto con **negritas** sin usar innerHTML
  const rich = (node, text) => {
    String(text || '').split(/(\*\*[^*]+\*\*)/).forEach((part) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) node.append(el('b', null, part.slice(2, -2)));
      else if (part) node.append(document.createTextNode(part));
    });
    return node;
  };

  // ---------- Cabecera ----------
  document.title = `${M.jefe} · ${fecha.toLocaleDateString('es')} · DPS Aion`;
  $('eyebrow').textContent = `Aion 2 · ${fechaTxt} · Grupo de ${M.personaje}`;
  $('jefe').textContent = M.jefe;
  if (A.titular) rich($('lede'), A.titular);
  else $('lede').textContent = R.matado
    ? `Jefe matado tras ${int(R.intentos)} intentos (${nf1.format(R.minutos_combate)} min de combate).`
    : `${int(R.intentos)} intentos (${nf1.format(R.minutos_combate)} min de combate). El mejor quitó el ${pct(R.mejor_pct)} de la vida del jefe, en el intento ${int(R.mejor_intento)}.`;
  (D.otros || []).forEach((o) => {
    $('otros').append(el('span', 'rx-pill' + (o.matado ? ' is-ok' : ''),
      o.matado ? `${o.jefe}: matado en ${int(o.kill_s)} s` : `${o.jefe}: ${int(o.intentos)} intentos sin kill`));
  });

  const tile = (parent, label, value, note, ok) => {
    const t = el('div', 'rx-tile');
    t.append(el('span', 'rx-tile-label', label), el('span', 'rx-tile-value' + (ok ? ' is-ok' : ''), value));
    if (note) t.append(el('span', 'rx-tile-note', note));
    parent.append(t);
  };
  const tiles = $('tiles');
  if (R.matado) tile(tiles, 'Resultado', 'Matado', `Kill en ${int(R.kill_s)} s`, true);
  else tile(tiles, 'Mejor progreso', pct(R.mejor_pct), `De la vida del jefe, en el intento ${int(R.mejor_intento)}`, true);
  tile(tiles, 'Intentos', int(R.intentos), `${nf1.format(R.minutos_combate)} min de combate`);
  tile(tiles, 'Muertes del grupo', int(R.muertes_grupo), 'Solo los jugadores de vuestro grupo');
  tile(tiles, 'DPS medio del grupo', compact(R.dps_grupo_medio), 'Media de los intentos');
  tile(tiles, 'Kill sin muertes', nf1.format(R.hp_jefe / R.dps_grupo_medio / 60) + ' min', 'Vida del jefe ÷ DPS medio');

  // ---------- Análisis ----------
  if (A.pendiente || !(A.recomendaciones || []).length) $('pendiente').hidden = false;
  (A.recomendaciones || []).forEach((r) => {
    const li = el('li');
    if (r.titulo) li.append(el('b', null, r.titulo + ' '));
    rich(li, r.texto);
    $('reco').append(li);
  });
  const nota = (t, d) => { $('notas').append(el('dt', null, t)); rich($('notas').appendChild(el('dd')), d); };
  nota('Origen', `Medidor de combate de la app de escritorio de Questlog en el equipo de ${M.personaje}.`);
  nota('Grupo', `El medidor solo registra vuestro grupo: ${M.grupo.join(', ')}.`);
  nota('Run', `${nf1.format(M.run_min)} min dentro de la mazmorra${M.limite_min ? ` (límite ${int(M.limite_min)} min)` : ''}.`);
  nota('Vida del jefe', `${compact(R.hp_jefe)}. «Vida quitada» es el daño total al jefe dividido entre su vida máxima.`);
  if (M.reseteos) nota('Fuera del análisis', `${int(M.reseteos)} pulls de reseteo de menos de 5 s y las muertes antes de empezar el combate.`);
  nota('Habilidades', 'La app guarda habilidades y adds por número. Los nombres se pueden poner en nombres.json del repositorio.');
  (A.notas || []).forEach((n) => nota(n.termino, n.texto));
  $('foot').textContent = `Datos extraídos el ${new Date(M.extraido).toLocaleString('es')} · run ${String(M.run).slice(0, 8)}`;
  document.querySelectorAll('[data-zona]').forEach((n) => { n.hidden = !zonas[n.dataset.zona]; });

  // ---------- Utilidades de gráficos ----------
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
  const empty = (box, msg) => box.append(el('div', 'rx-empty', msg));
  const yGrid = (svg, y, x0, x1, ticks, fmt) => ticks.forEach((v) => {
    svg.append('line').attr('x1', x0).attr('x2', x1).attr('y1', y(v)).attr('y2', y(v)).style('stroke', v ? 'var(--chart-grid)' : 'var(--chart-axis)');
    svg.append('text').attr('x', x0 - 6).attr('y', y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt(v));
  });

  // Barras horizontales con etiqueta a la izquierda
  const hbars = (box, rows, { label, value, valueText, critical, tip, ariaLabel, onClick }) => {
    if (!rows.length) return empty(box, 'Sin datos');
    const W = width(box), row = 22, m = { t: 2, r: 44, b: 2 };
    const H = m.t + m.b + rows.length * row;
    const svg = svgIn(box, W, H, ariaLabel);
    m.l = Math.min(W * 0.55, Math.ceil(measure(svg, rows.map(label))) + 10);
    const x = d3.scaleLinear([0, d3.max(rows, value) || 1], [m.l, W - m.r]);
    const y = d3.scaleBand(rows.map((_, i) => i), [m.t, H - m.b]).padding(0.25);
    const t = tipFor(box);
    const g = svg.append('g').selectAll('g').data(rows).join('g');
    g.append('text').attr('x', m.l - 8).attr('y', (d, i) => y(i) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
      .attr('class', (d) => (critical && critical(d) ? 'rx-strong' : null)).text(label);
    g.append('rect').attr('x', m.l).attr('y', (d, i) => y(i)).attr('height', y.bandwidth()).attr('width', (d) => Math.max(1, x(value(d)) - m.l)).attr('rx', 3)
      .style('fill', (d) => (critical && critical(d) ? 'var(--critical)' : 'var(--chart-muted)'))
      .style('cursor', onClick ? 'pointer' : null)
      .on('pointermove', (ev, d) => { const [px, py] = d3.pointer(ev, box); t.show(label(d), tip(d), px, py); })
      .on('pointerleave', () => t.hide())
      .on('click', (ev, d) => onClick && onClick(d));
    g.append('text').attr('x', (d) => x(value(d)) + 5).attr('y', (d, i) => y(i) + y.bandwidth() / 2).attr('dy', '0.32em').text(valueText);
  };

  // ---------- Gráficos de la raid ----------
  function drawProgreso(box) {
    const rows = D.intentos;
    const W = width(box), H = 240, m = { t: 18, r: 8, b: 30, l: 40 };
    const svg = svgIn(box, W, H, 'Vida quitada por intento');
    const x = d3.scaleBand(rows.map((d) => d.intento), [m.l, W - m.r]).padding(0.25);
    const y = d3.scaleLinear([0, 100], [H - m.b, m.t]);
    const best = d3.greatest(rows, (d) => d.progreso_pct);
    if (zonas.muro) svg.append('rect').attr('x', m.l).attr('width', W - m.l - m.r).attr('y', y(zonas.muro[1])).attr('height', y(zonas.muro[0]) - y(zonas.muro[1])).style('fill', 'var(--critical)').style('fill-opacity', 0.1);
    yGrid(svg, y, m.l, W - m.r, [0, 25, 50, 75, 100], (v) => v + ' %');
    const every = Math.ceil(16 / x.bandwidth());
    rows.forEach((d, i) => { if (i % every === 0 || d === best) svg.append('text').attr('x', x(d.intento) + x.bandwidth() / 2).attr('y', H - m.b + 16).attr('text-anchor', 'middle').attr('class', d === best ? 'rx-strong' : null).text(d.intento); });
    const t = tipFor(box);
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', (d) => x(d.intento)).attr('width', x.bandwidth()).attr('y', (d) => y(d.progreso_pct)).attr('height', (d) => Math.max(0, y(0) - y(d.progreso_pct))).attr('rx', 3)
      .style('fill', (d) => (d.matado ? 'var(--ok)' : d === best ? 'var(--series-1)' : 'var(--chart-muted)'))
      .on('pointermove', (ev, d) => {
        const [px, py] = d3.pointer(ev, box);
        t.show(`Intento ${d.intento}`, [
          d.matado ? 'Kill' : `${pct(d.progreso_pct)} de vida quitada`,
          `${int(d.duracion_s)} s · ${int(d.muertes)} muertes`,
          d.rotura_s == null ? 'Sin rotura de stagger' : `Rotura de stagger en el s ${int(d.rotura_s)}`,
          `Última muerte: ${skName(d.ultima_causa)}`
        ], px, py);
      })
      .on('pointerleave', () => t.hide());
    svg.append('text').attr('x', x(best.intento) + x.bandwidth() / 2).attr('y', y(best.progreso_pct) - 6).attr('text-anchor', 'middle').attr('class', 'rx-strong').text(pct(best.progreso_pct));
  }

  function drawCurva(box) {
    const pts = D.curva.map((d) => ({ intento: d.intento, t: d.t, p: d.progreso }));
    const series = d3.groups(pts, (d) => d.intento).map(([i, v]) => ({ intento: i, pts: v.sort((a, b) => a.t - b.t) }));
    series.forEach((s) => { s.end = s.pts[s.pts.length - 1]; });
    const best = d3.greatest(series, (s) => s.end.p);
    const last = d3.greatest(series, (s) => s.intento);
    const hi = [best, last].filter((s, i, a) => a.indexOf(s) === i);
    const W = width(box), H = 240, m = { t: 22, r: 12, b: 30, l: 40 };
    const svg = svgIn(box, W, H, 'Vida quitada a lo largo del combate');
    const x = d3.scaleLinear([0, d3.max(pts, (d) => d.t)], [m.l, W - m.r]).nice();
    const y = d3.scaleLinear([0, 100], [H - m.b, m.t]);
    if (zonas.ventana) svg.append('rect').attr('x', x(zonas.ventana[0])).attr('width', x(zonas.ventana[1]) - x(zonas.ventana[0])).attr('y', m.t).attr('height', H - m.b - m.t).style('fill', 'var(--critical)').style('fill-opacity', 0.1);
    yGrid(svg, y, m.l, W - m.r, [0, 25, 50, 75, 100], (v) => v + ' %');
    x.ticks(W < 420 ? 4 : 7).forEach((v) => svg.append('text').attr('x', x(v)).attr('y', H - m.b + 16).attr('text-anchor', 'middle').text(v + ' s'));
    const line = d3.line().x((d) => x(d.t)).y((d) => y(d.p));
    const color = (s) => (s === best ? 'var(--series-1)' : s === last ? 'var(--series-2)' : 'var(--chart-muted)');
    const isHi = (s) => hi.includes(s);
    const paths = svg.append('g').selectAll('path').data(series.filter((s) => !isHi(s)).concat(hi.slice().reverse())).join('path')
      .attr('d', (s) => line(s.pts)).style('fill', 'none').style('stroke', color).style('stroke-width', (s) => (isHi(s) ? 2.25 : 1.5))
      .style('stroke-linecap', 'round').style('stroke-linejoin', 'round').style('stroke-opacity', (s) => (isHi(s) ? 1 : 0.6));
    hi.forEach((s, i) => {
      svg.append('circle').attr('cx', x(s.end.t)).attr('cy', y(s.end.p)).attr('r', 3.5).style('fill', color(s));
      svg.append('text').attr('x', x(s.end.t)).attr('y', y(s.end.p) + (i && Math.abs(y(s.end.p) - y(best.end.p)) < 16 ? 16 : -8)).attr('text-anchor', 'end').attr('class', 'rx-strong')
        .text(`Intento ${s.intento} · ${pct(s.end.p)}`);
    });
    const t = tipFor(box);
    const del = d3.Delaunay.from(pts, (d) => x(d.t), (d) => y(d.p));
    const dot = svg.append('circle').attr('r', 4).style('fill', 'var(--fg)').attr('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [sx, sy] = d3.pointer(ev);
        const d = pts[del.find(sx, sy)];
        dot.attr('cx', x(d.t)).attr('cy', y(d.p)).attr('opacity', 1);
        paths.style('stroke-opacity', (s) => (s.intento === d.intento ? 1 : 0.2));
        const [px, py] = d3.pointer(ev, box);
        t.show(`Intento ${d.intento}`, [`${pct(d.p)} quitado en el s ${int(d.t)}`], px, py);
      })
      .on('pointerleave', () => { dot.attr('opacity', 0); t.hide(); paths.style('stroke-opacity', (s) => (isHi(s) ? 1 : 0.6)); });
  }

  function drawCausas(box) {
    hbars(box, D.causas, {
      ariaLabel: 'Muertes por habilidad',
      label: (d) => `${skName(d.habilidad)} · ${orgName(d.origen)}`,
      value: (d) => d.muertes, valueText: (d) => int(d.muertes),
      critical: (d) => d.golpe_max >= ONE_SHOT,
      tip: (d) => [`${int(d.muertes)} muertes`, `Golpe más fuerte: ${int(d.golpe_max)}`]
    });
  }

  function drawCasteos(box) {
    const casts = D.casteos;
    if (!casts.length) return empty(box, 'El medidor no registró casteos del jefe');
    const killers = new Set(D.causas.filter((d) => d.golpe_max >= ONE_SHOT).map((d) => d.habilidad));
    const skills = d3.groups(casts, (d) => d.habilidad).map(([s, v]) => ({ s, med: d3.median(v, (d) => d.t) })).sort((a, b) => a.med - b.med).map((o) => o.s);
    const W = width(box), row = 20, m = { t: 6, r: 12, b: 28 };
    const H = m.t + m.b + skills.length * row;
    const svg = svgIn(box, W, H, 'Casteos del jefe a lo largo del combate');
    m.l = Math.ceil(measure(svg, skills.map(skName))) + 10;
    const x = d3.scaleLinear([0, d3.max(casts, (d) => d.t)], [m.l, W - m.r]).nice();
    const y = d3.scaleBand(skills, [m.t, H - m.b]).padding(0.2);
    if (zonas.ventana) svg.append('rect').attr('x', x(zonas.ventana[0])).attr('width', x(zonas.ventana[1]) - x(zonas.ventana[0])).attr('y', m.t).attr('height', H - m.b - m.t).style('fill', 'var(--critical)').style('fill-opacity', 0.1);
    x.ticks(W < 420 ? 4 : 7).forEach((v) => {
      svg.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--chart-grid)');
      svg.append('text').attr('x', x(v)).attr('y', H - m.b + 16).attr('text-anchor', 'middle').text(v + ' s');
    });
    skills.forEach((s) => {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(s) + y.bandwidth() / 2).attr('y2', y(s) + y.bandwidth() / 2).style('stroke', 'var(--chart-grid)');
      svg.append('text').attr('x', m.l - 8).attr('y', y(s) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end').attr('class', killers.has(s) ? 'rx-strong' : null).text(skName(s));
    });
    const t = tipFor(box);
    svg.append('g').selectAll('circle').data(casts).join('circle')
      .attr('cx', (d) => x(d.t)).attr('cy', (d) => y(d.habilidad) + y.bandwidth() / 2).attr('r', 3.5)
      .style('fill', (d) => (killers.has(d.habilidad) ? 'var(--critical)' : 'var(--series-1)')).style('fill-opacity', 0.55)
      .on('pointermove', (ev, d) => { const [px, py] = d3.pointer(ev, box); t.show(skName(d.habilidad), [`Intento ${d.intento}, s ${int(d.t)}`], px, py); })
      .on('pointerleave', () => t.hide());
  }

  function drawTabla(tb) {
    tb.replaceChildren();
    const rows = D.jugadores;
    const maxDps = d3.max(rows, (r) => r.dps), maxDeaths = d3.max(rows, (r) => r.muertes);
    rows.forEach((r) => {
      const tr = el('tr', r.jugador === M.personaje ? 'is-self' : null);
      tr.dataset.jugador = r.jugador; tr.tabIndex = 0;
      if (r.jugador === abierto) tr.classList.add('is-open');
      const td = (text, cls) => tr.appendChild(el('td', cls, text));
      td(r.jugador); td(r.clase); td(int(r.gs), 'rx-opt');
      const c = el('td'); const w = el('span', 'rx-dpscell'); const b = el('span', 'rx-bar');
      b.style.width = (r.dps / maxDps * 4) + 'rem'; if (r.dps === maxDps) b.style.background = 'var(--series-1)';
      w.append(b, document.createTextNode(int(r.dps))); c.append(w); tr.append(c);
      td(int(r.hps)); td(compact(r.dano_recibido), 'rx-opt');
      td(int(r.muertes), r.muertes === maxDeaths ? 'rx-bad' : null);
      td(pct(r.crit_pct), 'rx-opt'); td(pct(r.espalda_pct), 'rx-opt');
      tr.addEventListener('click', () => abrirFicha(r.jugador, true));
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirFicha(r.jugador, true); } });
      tb.append(tr);
    });
  }

  function drawMapa(box) {
    const rows = D.dps_intento;
    const players = d3.groups(rows, (d) => d.jugador).map(([p, v]) => ({ p, m: d3.mean(v, (d) => d.dps) })).sort((a, b) => b.m - a.m).map((o) => o.p);
    const tries = Array.from(new Set(rows.map((d) => d.intento))).sort((a, b) => a - b);
    const W = width(box), row = 34, m = { t: 4, r: 4, b: 26 };
    const H = m.t + m.b + players.length * row;
    const svg = svgIn(box, W, H, 'DPS por jugador e intento');
    m.l = Math.ceil(measure(svg, players)) + 10;
    const x = d3.scaleBand(tries, [m.l, W - m.r]).padding(0.08);
    const y = d3.scaleBand(players, [m.t, H - m.b]).padding(0.08);
    const op = d3.scaleLinear(d3.extent(rows, (d) => d.dps), [0.12, 0.9]);
    players.forEach((p) => svg.append('text').attr('x', m.l - 8).attr('y', y(p) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
      .attr('class', p === M.personaje ? 'rx-strong' : null).style('cursor', 'pointer').text(p).on('click', () => abrirFicha(p, true)));
    const every = Math.ceil(16 / x.bandwidth());
    tries.forEach((tr, i) => { if (i % every === 0) svg.append('text').attr('x', x(tr) + x.bandwidth() / 2).attr('y', H - m.b + 16).attr('text-anchor', 'middle').text(tr); });
    const t = tipFor(box);
    const cells = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (d) => `translate(${x(d.intento)},${y(d.jugador)})`).style('cursor', 'pointer')
      .on('click', (ev, d) => abrirFicha(d.jugador, true));
    cells.append('rect').attr('width', x.bandwidth()).attr('height', y.bandwidth()).attr('rx', 3).style('fill', 'var(--series-1)').style('fill-opacity', (d) => op(d.dps))
      .on('pointermove', (ev, d) => { const [px, py] = d3.pointer(ev, box); t.show(`${d.jugador} · intento ${d.intento}`, [`${int(d.dps)} DPS`, `${int(d.muertes)} muertes`, 'Pulsa para ver su ficha'], px, py); })
      .on('pointerleave', () => t.hide());
    cells.each(function (d) {
      const g = d3.select(this);
      for (let i = 0; i < d.muertes; i++) g.append('circle').attr('cx', 5 + i * 6).attr('cy', 5).attr('r', 2).style('fill', 'var(--bg)').style('stroke', 'var(--fg)').style('stroke-width', 0.75).style('pointer-events', 'none');
      if (x.bandwidth() >= 34) g.append('text').attr('x', x.bandwidth() / 2).attr('y', y.bandwidth() / 2 + 4).attr('dy', '0.32em').attr('text-anchor', 'middle').style('fill', 'var(--fg)').style('pointer-events', 'none').text(k(d.dps));
    });
  }

  // ---------- Ficha de jugador ----------
  let abierto = null;
  const media = (f) => d3.mean(D.jugadores, f);
  function drawFicha() {
    const r = D.jugadores.find((j) => j.jugador === abierto);
    if (!r) { $('ficha').hidden = true; return; }
    const det = (D.detalle || {})[r.jugador] || { habilidades: [], recibido: [], muertes: [] };
    $('ficha').hidden = false;
    $('f-clase').textContent = r.clase + (r.jugador === M.personaje ? ' · tú' : '');
    $('f-nombre').textContent = r.jugador;
    $('f-equipo').textContent = `GS ${int(r.gs)} · CP ${int(r.cp)}`;
    const ft = $('f-tiles'); ft.replaceChildren();
    const vs = (v, m, fmt, higherBetter = true) => {
      const diff = m ? (v - m) / m * 100 : 0;
      const word = Math.abs(diff) < 3 ? 'en la media del grupo' : `${nf.format(Math.abs(diff))} % ${(diff > 0) === higherBetter ? 'por encima' : 'por debajo'} de la media`;
      return `${word} (${fmt(m)})`;
    };
    tile(ft, 'DPS', int(r.dps), vs(r.dps, media((j) => j.dps), int));
    tile(ft, 'HPS', int(r.hps), vs(r.hps, media((j) => j.hps), int));
    tile(ft, 'Muertes', int(r.muertes), vs(r.muertes, media((j) => j.muertes), (v) => nf1.format(v), false));
    tile(ft, 'Daño recibido', compact(r.dano_recibido), vs(r.dano_recibido, media((j) => j.dano_recibido), compact, false));
    tile(ft, 'Crítico · espalda', `${nf.format(r.crit_pct)} · ${nf.format(r.espalda_pct)} %`, 'De sus golpes al jefe');

    const recos = ((A.jugadores || {})[r.jugador]) || [];
    $('f-reco').replaceChildren(...recos.map((t) => rich(el('li'), t)));
    $('f-reco-pend').hidden = recos.length > 0;

    // DPS por intento frente a la media del grupo
    const box = $('f-dps'); box.replaceChildren();
    const mine = D.dps_intento.filter((d) => d.jugador === r.jugador);
    const avg = d3.rollup(D.dps_intento, (v) => d3.mean(v, (d) => d.dps), (d) => d.intento);
    const W = width(box), H = 170, m = { t: 12, r: 8, b: 26, l: 40 };
    const svg = svgIn(box, W, H, `DPS de ${r.jugador} por intento`);
    const x = d3.scaleBand(mine.map((d) => d.intento), [m.l, W - m.r]).padding(0.25);
    const y = d3.scaleLinear([0, d3.max(D.dps_intento, (d) => d.dps)], [H - m.b, m.t]).nice();
    yGrid(svg, y, m.l, W - m.r, y.ticks(4), k);
    const every = Math.ceil(16 / x.bandwidth());
    mine.forEach((d, i) => { if (i % every === 0) svg.append('text').attr('x', x(d.intento) + x.bandwidth() / 2).attr('y', H - m.b + 16).attr('text-anchor', 'middle').text(d.intento); });
    const t = tipFor(box);
    svg.append('g').selectAll('rect').data(mine).join('rect')
      .attr('x', (d) => x(d.intento)).attr('width', x.bandwidth()).attr('y', (d) => y(d.dps)).attr('height', (d) => y(0) - y(d.dps)).attr('rx', 3)
      .style('fill', 'var(--series-1)').style('fill-opacity', 0.85)
      .on('pointermove', (ev, d) => { const [px, py] = d3.pointer(ev, box); t.show(`Intento ${d.intento}`, [`${int(d.dps)} DPS`, `Media del grupo: ${int(avg.get(d.intento))}`, `${int(d.muertes)} muertes`], px, py); })
      .on('pointerleave', () => t.hide());
    svg.append('path').datum(mine).attr('d', d3.line().x((d) => x(d.intento) + x.bandwidth() / 2).y((d) => y(avg.get(d.intento))))
      .style('fill', 'none').style('stroke', 'var(--series-2)').style('stroke-width', 2).style('stroke-linejoin', 'round').style('pointer-events', 'none');
    mine.forEach((d) => { for (let i = 0; i < d.muertes; i++) svg.append('circle').attr('cx', x(d.intento) + x.bandwidth() / 2).attr('cy', y(d.dps) - 6 - i * 6).attr('r', 2.2).style('fill', 'var(--critical)').style('pointer-events', 'none'); });

    const hb = $('f-habilidades'); hb.replaceChildren();
    hbars(hb, det.habilidades, { ariaLabel: 'Daño por habilidad', label: (d) => skName(d.habilidad), value: (d) => d.pct, valueText: (d) => pct(d.pct),
      tip: (d) => [`${compact(d.dano)} de daño (${pct(d.pct)})`, `${int(d.golpes)} golpes · ${pct(d.crit_pct)} críticos`] });
    const rb = $('f-recibido'); rb.replaceChildren();
    hbars(rb, det.recibido, { ariaLabel: 'Daño recibido por habilidad', label: (d) => skName(d.habilidad), value: (d) => d.dano, valueText: (d) => compact(d.dano),
      critical: (d) => d.golpe_max >= ONE_SHOT, tip: (d) => [`${compact(d.dano)} en ${int(d.golpes)} golpes`, `Golpe más fuerte: ${int(d.golpe_max)}`] });

    const mb = $('f-muertes'); mb.replaceChildren();
    if (!det.muertes.length) { const tr = el('tr'); const c = el('td', null, 'Sin muertes'); c.colSpan = 4; tr.append(c); mb.append(tr); }
    det.muertes.forEach((d) => {
      const tr = el('tr');
      tr.append(el('td', null, int(d.intento)), el('td', null, int(d.t) + ' s'), el('td', null, `${skName(d.habilidad)} · ${orgName(d.origen)}`),
        el('td', d.golpe_max >= ONE_SHOT ? 'rx-bad' : null, d.golpe_max ? int(d.golpe_max) : '—'));
      mb.append(tr);
    });
  }
  function abrirFicha(nombre, desplazar) {
    abierto = abierto === nombre && desplazar ? null : nombre;
    history.replaceState(null, '', abierto ? '#' + encodeURIComponent(abierto) : location.pathname);
    drawTabla($('tabla'));
    drawFicha();
    if (abierto && desplazar) $('ficha').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  $('f-cerrar').addEventListener('click', () => abrirFicha(abierto, true));

  // ---------- Dibujo ----------
  const charts = [['ch-progreso', drawProgreso], ['ch-curva', drawCurva], ['ch-causas', drawCausas], ['ch-casteos', drawCasteos], ['ch-mapa', drawMapa]];
  function drawAll() {
    charts.forEach(([id, fn]) => { const b = $(id); b.replaceChildren(); fn(b); });
    drawTabla($('tabla'));
    drawFicha();
  }
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (D.jugadores.some((j) => j.jugador === fromHash)) abierto = fromHash;
  drawAll();
  if (abierto) $('ficha').scrollIntoView();
  let lastW = innerWidth, timer;
  addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; drawAll(); } }, 150); });
})();
