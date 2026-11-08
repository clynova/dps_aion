// Idiomas de la web (es / en). Elige: ?lang= en la URL > elección guardada > idioma del navegador.
// Los textos fijos del HTML llevan data-i18n="clave"; el resto lo pide el JS con I18N.t('clave', {vars}).
(function () {
  const DICT = {
    es: {
      'site.name': 'DPS Aion',
      'lang.label': 'Idioma',
      'home.eyebrow': 'Aion 2 · Medidor de Questlog',
      'home.title': 'Raids del grupo',
      'home.loading': 'Cargando el historial…',
      'home.empty': 'Todavía no hay raids guardadas.',
      'home.lede': '{n} {raids}, {k} con kill del jefe principal. Pulsa una para ver sus estadísticas, la ficha de cada jugador y las recomendaciones.',
      'home.raid1': 'raid guardada', 'home.raidN': 'raids guardadas',
      'home.evolution': 'Evolución por jefe',
      'home.evolution.card': 'Mejor intento de cada noche',
      'home.evolution.note': 'Vida quitada en el mejor intento de cada raid; en verde, las noches con kill.',
      'home.all': 'Todas las raids',
      'home.foot': 'Cada raid se extrae del medidor de combate de Questlog. El análisis de cada noche lo escribe Claude cuando se le pide.',
      'home.killed': 'matado', 'home.nokill': 'sin kill',
      'home.analyzed': 'Analizada', 'home.pending': 'Análisis pendiente',
      'home.stat.kill': 'Kill', 'home.stat.killed': 'jefe matado', 'home.stat.best': 'mejor intento',
      'home.stat.tries': 'intentos', 'home.stat.deaths': 'muertes', 'home.stat.dps': 'DPS medio',
      'raid.back': '← Todas las raids',
      'raid.loading': 'Cargando…',
      'raid.loadError': 'No se pudieron cargar los datos de esta raid.',
      'raid.eyebrow': 'Aion 2 · {fecha} · Grupo de {yo}',
      'raid.lede.kill': 'Jefe matado tras {n} intentos ({min} min de combate).',
      'raid.lede.wipe': '{n} intentos ({min} min de combate). El mejor quitó el {pct} de la vida del jefe, en el intento {i}.',
      'raid.other.kill': '{jefe}: matado en {s} s', 'raid.other.wipe': '{jefe}: {n} intentos sin kill',
      'tile.result': 'Resultado', 'tile.killed': 'Matado', 'tile.killIn': 'Kill en {s} s',
      'tile.best': 'Mejor progreso', 'tile.best.note': 'De la vida del jefe, en el intento {i}',
      'tile.tries': 'Intentos', 'tile.tries.note': '{min} min de combate',
      'tile.deaths': 'Muertes del grupo', 'tile.deaths.note': 'Solo los jugadores de vuestro grupo',
      'tile.dps': 'DPS medio del grupo', 'tile.dps.note': 'Media de los intentos',
      'tile.nodeath': 'Kill sin muertes', 'tile.nodeath.note': 'Vida del jefe ÷ DPS medio',
      'sec.progress': 'Progresión',
      'card.progress': 'Vida quitada al jefe en cada intento', 'card.progress.note': 'El mejor intento (o el kill) resaltado.',
      'legend.wall': 'Muro: donde murió la mayoría de intentos',
      'card.curve': 'Cómo baja la vida en cada intento', 'card.curve.note': 'Una línea por intento. Pasa el ratón para ver cada una.',
      'legend.window': 'Ventana donde se cortan los intentos',
      'sec.deaths': 'Qué os mata',
      'card.causes': 'Muertes por habilidad', 'card.causes.note': 'Muertes de vuestro grupo según la habilidad que dio el golpe final.',
      'legend.oneshot': 'Mata de un golpe', 'legend.rest': 'Resto',
      'card.casts': 'Qué castea el jefe y cuándo', 'card.casts.note': 'Cada punto es un casteo o telegrafiado en algún intento. En rojo, las habilidades que matan de un golpe.',
      'sec.players': 'Jugadores',
      'card.table': 'Rendimiento contra el jefe', 'card.table.note': 'Suma de todos los intentos. DPS y HPS sobre el tiempo de combate. Pulsa un jugador para ver su ficha.',
      'th.player': 'Jugador', 'th.class': 'Clase', 'th.skills': 'Habilidades principales', 'th.gs': 'GS', 'th.dps': 'DPS', 'th.hps': 'HPS',
      'th.taken': 'Daño recibido', 'th.deaths': 'Muertes', 'th.crit': 'Crítico', 'th.back': 'Por la espalda',
      'card.map': 'DPS de cada jugador en cada intento', 'card.map.note': 'Color más intenso, más DPS. Cada punto es una muerte en ese intento.',
      'sec.analysis': 'Análisis y qué cambiar',
      'analysis.pending': 'El análisis de esta raid todavía está pendiente. Las estadísticas de arriba ya son las definitivas.',
      'analysis.onlyEs': 'El análisis de esta raid solo está en español por ahora.',
      'notes.summary': 'Cómo se han sacado estos datos',
      'note.origin': 'Origen', 'note.origin.t': 'Medidor de combate de la app de escritorio de Questlog en el equipo de {yo}.',
      'note.group': 'Grupo', 'note.group.t': 'El medidor solo registra vuestro grupo: {g}.',
      'note.run': 'Run', 'note.run.t': '{min} min dentro de la mazmorra{lim}.', 'note.run.limit': ' (límite {m} min)',
      'note.hp': 'Vida del jefe', 'note.hp.t': '{hp}. «Vida quitada» es el daño total al jefe dividido entre su vida máxima.',
      'note.out': 'Fuera del análisis', 'note.out.t': '{n} pulls de reseteo de menos de 5 s y las muertes antes de empezar el combate.',
      'note.skills': 'Habilidades', 'note.skills.t': 'Nombres e iconos de questlog.gg. El juego llama «Ataque» a casi todos los golpes del jefe: esos se muestran con su número, salvo los que tienen un apodo descriptivo puesto a mano. Las «zonas» son invocaciones invisibles de las habilidades del jefe (áreas de daño), no enemigos.',
      'foot': 'Datos extraídos el {d} · run {run}',
      'f.you': 'tú', 'f.close': 'Cerrar', 'f.closeAria': 'Cerrar ficha',
      'f.reco': 'Recomendaciones', 'f.reco.none': 'Sin recomendaciones personales todavía para esta raid.',
      'f.dps': 'DPS en cada intento', 'f.dps.note': 'Comparado con la media del grupo (línea). Los puntos son muertes.',
      'f.skills': 'De dónde sale su daño', 'f.skills.note': 'Habilidades con las que más daño hace al jefe, en % de su daño total.',
      'f.taken': 'Qué le hace más daño', 'f.taken.note': 'Daño recibido por habilidad enemiga, con el golpe más fuerte.',
      'f.deaths': 'Sus muertes', 'f.deaths.note': 'Intento, segundo de combate y habilidad que dio el golpe final.',
      'f.th.try': 'Intento', 'f.th.sec': 'Segundo', 'f.th.skill': 'Habilidad', 'f.th.hit': 'Golpe',
      'f.nodeaths': 'Sin muertes',
      'f.avg': 'en la media del grupo', 'f.above': '{p} % por encima de la media', 'f.below': '{p} % por debajo de la media',
      'f.critback': 'Crítico · espalda', 'f.critback.note': 'De sus golpes al jefe', 'f.taken.tile': 'Daño recibido', 'f.deaths.tile': 'Muertes',
      'tip.try': 'Intento {i}', 'tip.kill': 'Kill', 'tip.hp': '{p} de vida quitada', 'tip.dur': '{s} s · {n} muertes',
      'tip.nobreak': 'Sin rotura de stagger', 'tip.break': 'Rotura de stagger en el s {s}', 'tip.last': 'Última muerte: {x}',
      'tip.curve': '{p} quitado en el s {s}', 'tip.deaths': '{n} muertes', 'tip.maxhit': 'Golpe más fuerte: {n}',
      'tip.skillno': 'Habilidad n.º {id}', 'tip.noskill': 'Habilidad no registrada', 'tip.cast': 'Intento {i}, s {s}',
      'tip.mapHead': '{p} · intento {i}', 'tip.clickCard': 'Pulsa para ver su ficha', 'tip.groupAvg': 'Media del grupo: {n}',
      'tip.dmg': '{d} de daño ({p})', 'tip.hits': '{n} golpes · {c} críticos', 'tip.takenHits': '{d} en {n} golpes',
      'chart.noCasts': 'El medidor no registró casteos del jefe', 'chart.noData': 'Sin datos',
      'chart.wall': 'muro', 'chart.tryLabel': 'Intento {i} · {p}',
      'nodata': 'Sin dato', 'unknownOrigin': 'origen desconocido', 'npc': 'NPC {id}',
      'aria.progress': 'Vida quitada por intento', 'aria.curve': 'Vida quitada a lo largo del combate', 'aria.causes': 'Muertes por habilidad',
      'aria.casts': 'Casteos del jefe a lo largo del combate', 'aria.map': 'DPS por jugador e intento', 'aria.fdps': 'DPS de {p} por intento',
      'aria.fskills': 'Daño por habilidad', 'aria.ftaken': 'Daño recibido por habilidad',
      'class.gladiator': 'Gladiador', 'class.templar': 'Templario', 'class.assassin': 'Asesino', 'class.ranger': 'Arquero', 'class.sorcerer': 'Hechicero',
      'class.elementalist': 'Espiritualista', 'class.cleric': 'Clérigo', 'class.chanter': 'Cantor', 'class.fighter': 'Luchador',
      'q.open': '«', 'q.close': '»'
    },
    en: {
      'site.name': 'DPS Aion',
      'lang.label': 'Language',
      'home.eyebrow': 'Aion 2 · Questlog meter',
      'home.title': 'Group raids',
      'home.loading': 'Loading history…',
      'home.empty': 'No raids saved yet.',
      'home.lede': '{n} {raids}, {k} with a kill of the main boss. Open one to see its stats, each player’s card and the recommendations.',
      'home.raid1': 'raid saved', 'home.raidN': 'raids saved',
      'home.evolution': 'Progress by boss',
      'home.evolution.card': 'Best attempt of each night',
      'home.evolution.note': 'Boss HP removed in each raid’s best attempt; green marks nights with a kill.',
      'home.all': 'All raids',
      'home.foot': 'Each raid is extracted from the Questlog combat meter. Claude writes each night’s analysis on request.',
      'home.killed': 'killed', 'home.nokill': 'no kill',
      'home.analyzed': 'Analyzed', 'home.pending': 'Analysis pending',
      'home.stat.kill': 'Kill', 'home.stat.killed': 'boss killed', 'home.stat.best': 'best attempt',
      'home.stat.tries': 'attempts', 'home.stat.deaths': 'deaths', 'home.stat.dps': 'avg DPS',
      'raid.back': '← All raids',
      'raid.loading': 'Loading…',
      'raid.loadError': 'Could not load this raid’s data.',
      'raid.eyebrow': 'Aion 2 · {fecha} · {yo}’s group',
      'raid.lede.kill': 'Boss killed after {n} attempts ({min} min of combat).',
      'raid.lede.wipe': '{n} attempts ({min} min of combat). The best one removed {pct} of the boss’s HP, on attempt {i}.',
      'raid.other.kill': '{jefe}: killed in {s} s', 'raid.other.wipe': '{jefe}: {n} attempts, no kill',
      'tile.result': 'Result', 'tile.killed': 'Killed', 'tile.killIn': 'Kill in {s} s',
      'tile.best': 'Best progress', 'tile.best.note': 'Of the boss’s HP, on attempt {i}',
      'tile.tries': 'Attempts', 'tile.tries.note': '{min} min of combat',
      'tile.deaths': 'Group deaths', 'tile.deaths.note': 'Only the players in your group',
      'tile.dps': 'Group avg DPS', 'tile.dps.note': 'Average across attempts',
      'tile.nodeath': 'Deathless kill', 'tile.nodeath.note': 'Boss HP ÷ avg DPS',
      'sec.progress': 'Progress',
      'card.progress': 'Boss HP removed per attempt', 'card.progress.note': 'Best attempt (or the kill) highlighted.',
      'legend.wall': 'Wall: where most attempts died',
      'card.curve': 'How the boss HP drops in each attempt', 'card.curve.note': 'One line per attempt. Hover to see each one.',
      'legend.window': 'Window where attempts break down',
      'sec.deaths': 'What kills you',
      'card.causes': 'Deaths by ability', 'card.causes.note': 'Your group’s deaths by the ability that landed the killing blow.',
      'legend.oneshot': 'One-shot', 'legend.rest': 'Other',
      'card.casts': 'What the boss casts and when', 'card.casts.note': 'Each dot is a cast or telegraph in some attempt. Red marks abilities that one-shot.',
      'sec.players': 'Players',
      'card.table': 'Performance against the boss', 'card.table.note': 'Totals across all attempts. DPS and HPS over combat time. Click a player to open their card.',
      'th.player': 'Player', 'th.class': 'Class', 'th.skills': 'Top skills', 'th.gs': 'GS', 'th.dps': 'DPS', 'th.hps': 'HPS',
      'th.taken': 'Damage taken', 'th.deaths': 'Deaths', 'th.crit': 'Crit', 'th.back': 'From behind',
      'card.map': 'Each player’s DPS per attempt', 'card.map.note': 'Darker means more DPS. Each dot is a death in that attempt.',
      'sec.analysis': 'Analysis and what to change',
      'analysis.pending': 'This raid’s analysis is still pending. The stats above are final.',
      'analysis.onlyEs': 'This raid’s analysis is only available in Spanish for now.',
      'notes.summary': 'How this data was collected',
      'note.origin': 'Source', 'note.origin.t': 'Combat meter of the Questlog desktop app on {yo}’s computer.',
      'note.group': 'Group', 'note.group.t': 'The meter only records your group: {g}.',
      'note.run': 'Run', 'note.run.t': '{min} min inside the dungeon{lim}.', 'note.run.limit': ' ({m} min limit)',
      'note.hp': 'Boss HP', 'note.hp.t': '{hp}. “HP removed” is total damage to the boss divided by its max HP.',
      'note.out': 'Left out', 'note.out.t': '{n} reset pulls under 5 s and deaths before combat started.',
      'note.skills': 'Abilities', 'note.skills.t': 'Names and icons from questlog.gg. The game calls almost every boss hit “Attack”: those show their number, except the ones with a hand-written nickname. “Zones” are invisible summons from the boss’s abilities (damage areas), not enemies.',
      'foot': 'Data extracted on {d} · run {run}',
      'f.you': 'you', 'f.close': 'Close', 'f.closeAria': 'Close card',
      'f.reco': 'Recommendations', 'f.reco.none': 'No personal recommendations for this raid yet.',
      'f.dps': 'DPS per attempt', 'f.dps.note': 'Against the group average (line). Dots are deaths.',
      'f.skills': 'Where their damage comes from', 'f.skills.note': 'Abilities doing the most damage to the boss, as % of their total.',
      'f.taken': 'What hurts them most', 'f.taken.note': 'Damage taken by enemy ability, with the biggest hit.',
      'f.deaths': 'Their deaths', 'f.deaths.note': 'Attempt, second of combat and the ability that landed the killing blow.',
      'f.th.try': 'Attempt', 'f.th.sec': 'Second', 'f.th.skill': 'Ability', 'f.th.hit': 'Hit',
      'f.nodeaths': 'No deaths',
      'f.avg': 'at the group average', 'f.above': '{p}% above average', 'f.below': '{p}% below average',
      'f.critback': 'Crit · behind', 'f.critback.note': 'Of their hits on the boss', 'f.taken.tile': 'Damage taken', 'f.deaths.tile': 'Deaths',
      'tip.try': 'Attempt {i}', 'tip.kill': 'Kill', 'tip.hp': '{p} HP removed', 'tip.dur': '{s} s · {n} deaths',
      'tip.nobreak': 'No stagger break', 'tip.break': 'Stagger broken at {s} s', 'tip.last': 'Last death: {x}',
      'tip.curve': '{p} removed at {s} s', 'tip.deaths': '{n} deaths', 'tip.maxhit': 'Biggest hit: {n}',
      'tip.skillno': 'Ability #{id}', 'tip.noskill': 'Ability not recorded', 'tip.cast': 'Attempt {i}, {s} s',
      'tip.mapHead': '{p} · attempt {i}', 'tip.clickCard': 'Click to open their card', 'tip.groupAvg': 'Group average: {n}',
      'tip.dmg': '{d} damage ({p})', 'tip.hits': '{n} hits · {c} crits', 'tip.takenHits': '{d} in {n} hits',
      'chart.noCasts': 'The meter recorded no boss casts', 'chart.noData': 'No data',
      'chart.wall': 'wall', 'chart.tryLabel': 'Attempt {i} · {p}',
      'nodata': 'No data', 'unknownOrigin': 'unknown source', 'npc': 'NPC {id}',
      'aria.progress': 'HP removed per attempt', 'aria.curve': 'HP removed over the fight', 'aria.causes': 'Deaths by ability',
      'aria.casts': 'Boss casts over the fight', 'aria.map': 'DPS by player and attempt', 'aria.fdps': '{p}’s DPS per attempt',
      'aria.fskills': 'Damage by ability', 'aria.ftaken': 'Damage taken by ability',
      'class.gladiator': 'Gladiator', 'class.templar': 'Templar', 'class.assassin': 'Assassin', 'class.ranger': 'Ranger', 'class.sorcerer': 'Sorcerer',
      'class.elementalist': 'Spiritmaster', 'class.cleric': 'Cleric', 'class.chanter': 'Chanter', 'class.fighter': 'Brawler',
      'q.open': '“', 'q.close': '”'
    }
  };
  const LANGS = ['es', 'en'];
  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const fromUrl = new URLSearchParams(location.search).get('lang');
  let lang = LANGS.includes(fromUrl) ? fromUrl : LANGS.includes(read('lang')) ? read('lang') : ((navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en');
  if (LANGS.includes(fromUrl)) write('lang', fromUrl);
  document.documentElement.lang = lang;

  const t = (key, vars) => {
    let s = (DICT[lang] && DICT[lang][key]) ?? DICT.es[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  };
  const apply = (root = document) => {
    root.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    root.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
  };
  const setLang = (l) => {
    if (!LANGS.includes(l) || l === lang) return;
    write('lang', l);
    const u = new URL(location.href); u.searchParams.delete('lang');
    location.replace(u.toString());
  };
  const toggle = () => {
    const box = document.createElement('div'); box.className = 'rx-lang'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', t('lang.label'));
    LANGS.forEach((l) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = l.toUpperCase(); b.lang = l;
      b.setAttribute('aria-pressed', String(l === lang));
      b.addEventListener('click', () => setLang(l));
      box.append(b);
    });
    return box;
  };
  window.I18N = { lang, t, apply, setLang, locale: lang === 'es' ? 'es' : 'en' };
  apply();
  document.querySelectorAll('[data-lang-toggle]').forEach((slot) => slot.replaceChildren(toggle()));
})();
