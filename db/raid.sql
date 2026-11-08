-- Genera el data.json de una raid (lo que lee assets/raid.js). Lo ejecuta tools/extraer-raid.ps1 con:
--   set variable slug = '...'; set variable jefe = '...'; set variable fecha = '...'; set variable extraido = '...';
-- La raid tiene que estar en la tabla raids (slug, run, npc). Devuelve una fila con el JSON.
-- Reglas (las mismas que la versión anterior en PowerShell): intentos = encuentros de la run contra el jefe
-- principal de más de 5 s; el grupo, los jugadores de tu grupo que hicieron daño; DPS = daño al jefe / duración;
-- redondeos al par más cercano (round_even), como [math]::Round.

create or replace temp macro rd(x) as round_even(x, 0)::bigint;   -- entero
create or replace temp macro rd1(x) as round_even(x * 10, 0) / 10;  -- un decimal (así coincide con .NET: 8.45 -> 8.4)

create or replace temp table r as
select ra.slug, ra.run, ra.npc, ru.log, ru.mazmorra, ru.personaje, ru.limite_ms,
  epoch_ms(ru.salida) - epoch_ms(ru.entrada) run_ms
from raids ra join runs ru on ru.id = ra.run where ra.slug = getvariable('slug');

create or replace temp table it as
select i.intento, i.enc, i.duracion_s dur, i.matado, j.entidad jefe, j.vida_max, j.dano jefe_dano,
  case when i.matado then 100 else rd1(100 * j.dano / j.vida_max) end bp
from intentos i join jefe_enc j on j.enc = i.enc where i.raid = getvariable('slug');

create or replace temp table ji as
select it.intento, it.enc, it.dur, it.jefe, j.entidad, j.nombre, j.clase, j.gs, j.cp
from it join jugadores j on j.enc = it.enc join grupo g on g.raid = getvariable('slug') and g.nombre = j.nombre;

-- Daño al jefe, curación y daño recibido de cada jugador en cada intento
create or replace temp table pi as
select ji.*,
  coalesce((select sum(g.dano) from golpes g where g.enc = ji.enc and g.dueno = ji.entidad and g.objetivo = ji.jefe), 0) dmg,
  coalesce((select count(*) from golpes g where g.enc = ji.enc and g.dueno = ji.entidad and g.objetivo = ji.jefe), 0) hits,
  coalesce((select sum(g.critico::int) from golpes g where g.enc = ji.enc and g.dueno = ji.entidad and g.objetivo = ji.jefe), 0) crit,
  coalesce((select sum(g.espalda::int) from golpes g where g.enc = ji.enc and g.dueno = ji.entidad and g.objetivo = ji.jefe), 0) back,
  coalesce((select sum(c.cantidad) from curaciones c where c.enc = ji.enc and c.dueno = ji.entidad), 0) heal,
  coalesce((select sum(x.dano) from recibido x where x.enc = ji.enc and x.objetivo = ji.entidad), 0) taken,
  (select count(*) from muertes m where m.enc = ji.enc and m.nombre = ji.nombre and m.t_ms >= 0) deaths
from ji;

-- Muertes del grupo, con el golpe más fuerte recibido en los 5 s anteriores
create or replace temp table de as
select it.intento, m.orden, m.nombre, m.t_ms,
  coalesce(nullif(m.habilidad, 0)::varchar, '') habilidad,
  case when m.npc = (select npc from r) then 'jefe' when coalesce(m.npc, 0) <> 0 then m.npc::varchar else '' end origen,
  coalesce((select max(x.dano) from recibido x
            where x.enc = m.enc and x.t_ms between m.t_ms - 5000 and m.t_ms + 50
              and x.objetivo = (select max_by(j.entidad, j.entidad) from jugadores j where j.enc = m.enc and j.nombre = m.nombre)), 0) golpe_max
from it join muertes m on m.enc = it.enc
where m.t_ms >= 0 and m.nombre in (select nombre from grupo where raid = getvariable('slug'));

-- Intentos
create or replace temp table iv as
select it.intento, rd(it.dur) duracion_s, it.bp progreso_pct, it.matado,
  rd(coalesce((select sum(pi.dmg / pi.dur) from pi where pi.intento = it.intento), 0)) dps_grupo,
  (select count(*) from de where de.intento = it.intento) muertes,
  (select rd(min(b.t_ms) / 1000) from roturas b where b.enc = it.enc) rotura_s,
  (select max_by(de.habilidad, de.orden) from de where de.intento = it.intento and de.habilidad <> '') ultima_causa
from it;

-- Curva: segundo en que el daño total al jefe cruza cada 5 %
create or replace temp table cu as
with h as (
  select it.intento, it.bp, g.t_ms, floor(100 * sum(g.dano) over (partition by it.intento order by g.orden) / it.vida_max / 5) * 5 pct
  from it join golpes g on g.enc = it.enc and g.objetivo = it.jefe
), marcas as (
  select intento, pct progreso, rd1(min_by(t_ms, t_ms) / 1000) t from h where pct >= 5 and pct < bp group by intento, pct
)
select intento, 0 t, 0 progreso, 0 k from it
union all select intento, t, progreso, 1 from marcas
union all select intento, rd1(dur), bp, 2 from it;

-- Jugadores (acumulado de la raid)
create or replace temp table jv as
select nombre jugador, first(clase order by intento) clase_id, first(gs order by intento) gs, first(cp order by intento) cp,
  rd(sum(dmg) / sum(dur)) dps, rd(sum(heal) / sum(dur)) hps, rd(sum(taken)) dano_recibido, sum(deaths) muertes,
  case when sum(hits) > 0 then rd1(100 * sum(crit) / sum(hits)) else 0 end crit_pct,
  case when sum(hits) > 0 then rd1(100 * sum(back) / sum(hits)) else 0 end espalda_pct,
  greatest(1, sum(dmg)) dmg_total
from pi group by nombre;

-- Causas de muerte del grupo
create or replace temp table ca as
select habilidad, origen, count(*) muertes, rd(max(golpe_max)) golpe_max, min(intento * 100000 + orden) primera
from de group by habilidad, origen;

-- Detalle de cada jugador: habilidades contra el jefe, daño recibido por habilidad y muertes
create or replace temp table dsk as
select pi.nombre, g.habilidad, sum(g.dano) dano, count(*) golpes, sum(g.critico::int) crit
from pi join golpes g on g.enc = pi.enc and g.dueno = pi.entidad and g.objetivo = pi.jefe group by all;
create or replace temp table dtk as
select pi.nombre, x.habilidad, sum(x.dano) dano, count(*) golpes, max(x.dano) maximo
from pi join recibido x on x.enc = pi.enc and x.objetivo = pi.entidad group by all;

select json_object(
  'meta', json_object(
    'slug', getvariable('slug'), 'run', (select run from r), 'fecha', getvariable('fecha'), 'mazmorra', (select mazmorra from r),
    'jefe', getvariable('jefe'), 'npc', (select npc from r), 'personaje', (select personaje from r),
    'grupo', (select to_json(list(nombre order by nombre)) from grupo where raid = getvariable('slug')),
    'run_min', (select rd1(run_ms / 60000) from r),
    'limite_min', (select case when coalesce(limite_ms, 0) > 0 then rd(limite_ms / 60000) end from r),
    'reseteos', (select count(*) from encuentros e where e.log = (select log from r) and e.npc = (select npc from r) and e.duracion_s <= 5),
    'extraido', getvariable('extraido')),
  'resumen', (select json_object(
    'intentos', count(*), 'matado', bool_or(matado),
    'kill_s', rd(min_by(duracion_s, intento) filter (where matado)),
    'minutos_combate', rd1(sum(duracion_s) / 60),
    'mejor_pct', arg_max(progreso_pct, progreso_pct * 1000 - intento), 'mejor_intento', arg_max(intento, progreso_pct * 1000 - intento),
    'muertes_grupo', sum(muertes), 'dps_grupo_medio', rd(avg(dps_grupo)),
    'hp_jefe', (select max(vida_max) from it)) from iv),
  'otros', coalesce((
    select to_json(list(json_object('npc', npc, 'jefe', coalesce(nombre, 'Jefe ' || npc), 'intentos', n, 'matado', k is not null,
      'kill_s', rd(k), 'dps_raid', rd(case when k is not null then kdps else maxdps end)) order by primero))
    from (
      select e.npc, count(*) n, min(e.inicio) primero, min(e.duracion_s) filter (where e.matado) k,
        arg_min(e.dps, e.duracion_s) filter (where e.matado) kdps, max(e.dps) maxdps,
        (select nullif(es, '') from nombres nm where nm.tipo = 'npc' and nm.id = e.npc) nombre
      from encuentros e where e.log = (select log from r) and e.npc <> (select npc from r) and e.duracion_s > 5 group by e.npc
    )), '[]'::json),
  'intentos', (select to_json(list(json_object('intento', intento, 'duracion_s', duracion_s, 'progreso_pct', progreso_pct, 'matado', matado,
      'dps_grupo', dps_grupo, 'muertes', muertes, 'rotura_s', rotura_s, 'ultima_causa', ultima_causa) order by intento)) from iv),
  'curva', (select to_json(list(json_object('intento', intento, 't', t, 'progreso', progreso) order by intento, k, progreso)) from cu),
  'jugadores', (select to_json(list(json_object('jugador', jugador,
      'clase', case clase_id when 'templar' then 'Templario' when 'assassin' then 'Asesino' when 'elementalist' then 'Espiritualista'
        when 'cleric' then 'Clérigo' when 'sorcerer' then 'Hechicero' when 'gladiator' then 'Gladiador' when 'ranger' then 'Arquero'
        when 'chanter' then 'Cantor' when 'fighter' then 'Luchador' else clase_id end,
      'clase_id', clase_id, 'gs', gs, 'cp', cp, 'dps', dps, 'hps', hps, 'dano_recibido', dano_recibido, 'muertes', muertes,
      'crit_pct', crit_pct, 'espalda_pct', espalda_pct) order by dps desc, jugador)) from jv),
  'dps_intento', (select to_json(list(json_object('intento', intento, 'jugador', nombre, 'dps', rd(dmg / dur), 'muertes', deaths)
      order by intento, nombre)) from pi),
  'causas', coalesce((select to_json(list(json_object('habilidad', habilidad, 'origen', origen, 'muertes', muertes, 'golpe_max', golpe_max)
      order by muertes desc, primera)) from ca), '[]'::json),
  'casteos', coalesce((select to_json(list(json_object('intento', intento, 't', t, 'habilidad', habilidad) order by intento, tipo, t_ms)) from (
      select it.intento, c.t_ms, c.tipo, rd1(c.t_ms / 1000) t, c.habilidad::varchar habilidad
      from it join casteos c on c.enc = it.enc
      where c.npc = (select npc from r) and c.tipo in ('barra', 'telegrafiado') and rd1(c.t_ms / 1000) >= 0)), '[]'::json),
  'detalle', (select json_group_object(jv.jugador, json_object(
      'habilidades', coalesce((select to_json(list(json_object('habilidad', habilidad::varchar, 'dano', rd(dano),
          'pct', rd1(100 * dano / jv.dmg_total), 'golpes', golpes, 'crit_pct', rd1(100 * crit / greatest(1, golpes))) order by dano desc, habilidad))
        from (select * from dsk where dsk.nombre = jv.jugador order by dano desc, habilidad limit 12)), '[]'::json),
      'recibido', coalesce((select to_json(list(json_object('habilidad', habilidad::varchar, 'dano', rd(dano), 'golpes', golpes,
          'golpe_max', rd(maximo)) order by dano desc, habilidad))
        from (select * from dtk where dtk.nombre = jv.jugador order by dano desc, habilidad limit 8)), '[]'::json),
      'muertes', coalesce((select to_json(list(json_object('intento', intento, 't', rd(t_ms / 1000), 'habilidad', habilidad,
          'origen', origen, 'golpe_max', rd(golpe_max)) order by intento, orden)) from de where de.nombre = jv.jugador), '[]'::json)
    )) from jv)
) as raid_json;
