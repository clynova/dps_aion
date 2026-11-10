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

-- Un jugador puede salir dos veces en un encuentro, con dos entidades (sale de la mazmorra y vuelve a entrar): se
-- queda la entidad con más eventos (golpes dados y recibidos y curaciones) y, a igualdad, la más alta. Una fila por
-- intento y jugador: todo lo demás (dps_intento, las claves de la base) cuenta con eso.
create or replace temp table ji as
select it.intento, it.enc, it.dur, it.jefe, j.entidad, j.nombre, j.servidor, j.clase, j.gs, j.cp
from it join jugadores j on j.enc = it.enc join grupo g on g.raid = getvariable('slug') and g.nombre = j.nombre
left join (select enc, ent, count(*) n from (
    select enc, dueno ent from golpes union all select enc, objetivo from recibido union all select enc, dueno from curaciones) group by all
  ) ev on ev.enc = j.enc and ev.ent = j.entidad
qualify row_number() over (partition by it.enc, j.nombre order by coalesce(ev.n, 0) desc, j.entidad desc) = 1;

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

-- Muertes del grupo, con el golpe más fuerte recibido en los 5 s anteriores. También: vida (% del máximo) 5 s y
-- 1 s antes (la última lectura hasta ese momento; 100 si aún no había ninguna) y el daño y la curación recibidos en esos 5 s.
create or replace temp table de0 as
select it.intento, m.enc, m.orden, m.nombre, m.t_ms, m.habilidad hab, m.npc,
  (select max(ji.entidad) from ji where ji.enc = m.enc and ji.nombre = m.nombre) ent
from it join muertes m on m.enc = it.enc
where m.t_ms >= 0 and m.nombre in (select nombre from grupo where raid = getvariable('slug'));
create or replace temp table de as
select intento, orden, nombre, t_ms,
  coalesce(nullif(hab, 0)::varchar, '') habilidad,
  case when npc = (select npc from r) then 'jefe' when coalesce(npc, 0) <> 0 then npc::varchar else '' end origen,
  coalesce((select max(x.dano) from recibido x where x.enc = de0.enc and x.t_ms between de0.t_ms - 5000 and de0.t_ms + 50 and x.objetivo = de0.ent), 0) golpe_max,
  coalesce((select arg_max(100 * v.vida / v.vida_max, v.t_ms) from vida v
            where v.enc = de0.enc and v.entidad = de0.ent and v.vida_max > 0 and v.t_ms <= de0.t_ms - 5000), 100) vida_5s,
  coalesce((select arg_max(100 * v.vida / v.vida_max, v.t_ms) from vida v
            where v.enc = de0.enc and v.entidad = de0.ent and v.vida_max > 0 and v.t_ms <= de0.t_ms - 1000), 100) vida_1s,
  coalesce((select sum(x.dano) from recibido x where x.enc = de0.enc and x.t_ms between de0.t_ms - 5000 and de0.t_ms + 50 and x.objetivo = de0.ent), 0) dano_5s,
  coalesce((select sum(c.cantidad) from curaciones c where c.enc = de0.enc and c.t_ms between de0.t_ms - 5000 and de0.t_ms and c.objetivo = de0.ent), 0) cura_5s
from de0;

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
select nombre jugador, first(servidor order by intento) servidor, first(clase order by intento) clase_id, first(gs order by intento) gs, first(cp order by intento) cp,
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

-- Apoyo: curación por habilidad (a cualquiera), a quién del grupo cura, escudos puestos y lo que absorbieron
create or replace temp table dcu as
select pi.nombre, c.habilidad, sum(c.cantidad) cantidad, count(*) golpes
from pi join curaciones c on c.enc = pi.enc and c.dueno = pi.entidad group by all;
create or replace temp table dco as
select pi.nombre, o.nombre objetivo, sum(c.cantidad) cantidad
from pi join curaciones c on c.enc = pi.enc and c.dueno = pi.entidad join ji o on o.enc = c.enc and o.entidad = c.objetivo group by all;
create or replace temp table des as
select pi.nombre, e.habilidad, sum(e.cantidad) cantidad
from pi join escudos e on e.enc = pi.enc and e.dueno = pi.entidad group by all;
create or replace temp table ap as
select nombre,
  coalesce((select sum(cantidad) from dcu where dcu.nombre = p.nombre), 0) curacion,
  coalesce((select sum(cantidad) from des where des.nombre = p.nombre), 0) escudos,
  coalesce((select sum(a.cantidad) from pi join absorciones a on a.enc = pi.enc and a.dueno = pi.entidad where pi.nombre = p.nombre), 0) absorbido
from (select distinct nombre from pi) p;

-- Supervivencia: golpes recibidos y mitigados (bloqueo, parada…), ataques evitados (fallos de los npcs contra él),
-- curación y escudo recibidos, resurrecciones y % del tiempo vivo por debajo del 30 % de vida
create or replace temp table smi as
select pi.nombre, x.mitigacion, count(*) n
from pi join recibido x on x.enc = pi.enc and x.objetivo = pi.entidad where x.mitigacion is not null group by all;
create or replace temp table sev as
select pi.nombre, f.resultado, count(*) n
from pi join fallos f on f.enc = pi.enc and f.objetivo = pi.entidad
where not exists (select 1 from ji o where o.enc = f.enc and o.entidad = f.dueno) group by all;
create or replace temp table svd as   -- tramos entre lecturas de vida, dentro del intento
select pi.nombre, v.vida, v.vida_max,
  least(coalesce(lead(v.t_ms) over (partition by v.enc, v.entidad order by v.t_ms), pi.dur * 1000), pi.dur * 1000) - greatest(v.t_ms, 0) ms
from pi join vida v on v.enc = pi.enc and v.entidad = pi.entidad
where v.t_ms <= pi.dur * 1000;
create or replace temp table sv as
select nombre,
  coalesce((select sum(golpes) from dtk where dtk.nombre = p.nombre), 0) golpes,
  coalesce((select sum(c.cantidad) from pi join curaciones c on c.enc = pi.enc and c.objetivo = pi.entidad where pi.nombre = p.nombre), 0) cura_recibida,
  coalesce((select sum(a.cantidad) from pi join absorciones a on a.enc = pi.enc and a.objetivo = pi.entidad where pi.nombre = p.nombre), 0) escudo_recibido,
  (select count(*) from pi join resurrecciones x on x.enc = pi.enc and x.nombre = pi.nombre and x.t_ms >= 0 where pi.nombre = p.nombre) resurrecciones,
  (select sum(dur) * 1000 from pi where pi.nombre = p.nombre) - coalesce((select sum(ms) from svd where svd.nombre = p.nombre and vida <= 0 and ms > 0), 0) vivo_ms,
  coalesce((select sum(ms) from svd where svd.nombre = p.nombre and vida > 0 and vida < 0.3 * vida_max and ms > 0), 0) bajo30_ms
from (select distinct nombre from pi) p;

-- Rotación: casteos de habilidades de clase (ids de 8 cifras 1x……) dentro del intento. En la tabla usos cada
-- habilidad sale con variantes: el casteo lleva un sufijo de especialización >= 100 (14050340) o múltiplo de 10
-- (estigmas: 14380030); los sufijos pequeños (14050008, 14380007) son efectos que se disparan solos cada
-- 0,5-1 s y no cuentan. Es una regla deducida de los datos (recargas de questlog.gg y la build propia), no del juego.
-- La variante se agrupa en su habilidad base (14050000), la de golpes y nombres. Pausa = más de 3 s entre dos
-- casteos sin que muriera entre medias. Primer golpe = mediana del primer golpe al jefe por intento.
-- parada = 'cancelled' (solo en el personaje que graba) es un casteo que golpeó y cuya animación se canceló
-- para encadenar otro: cuenta como casteo. Solo 'interrupted' es un casteo fallido.
create or replace temp table ru as
select pi.nombre, pi.enc, pi.entidad, (u.habilidad // 10000) * 10000 hab, u.t_ms, u.parada
from pi join usos u on u.enc = pi.enc and u.dueno = pi.entidad
where u.t_ms between 0 and pi.dur * 1000 and u.habilidad between 11000000 and 19999999
  and (u.habilidad % 10000 >= 100 or (u.habilidad % 10000 >= 10 and u.habilidad % 10 = 0));
create or replace temp table rg as   -- tiempo entre usos completados consecutivos
select nombre, enc, entidad, t_ms, t_ms - lag(t_ms) over (partition by enc, entidad order by t_ms) gap, lag(t_ms) over (partition by enc, entidad order by t_ms) prev
from ru where coalesce(parada, '') <> 'interrupted';
create or replace temp table ro as
select nombre,
  (select count(*) from ru where ru.nombre = p.nombre and coalesce(parada, '') <> 'interrupted') usos,
  (select count(*) from ru where ru.nombre = p.nombre and parada = 'interrupted') interrumpidos,
  coalesce((select sum(gap) from rg where rg.nombre = p.nombre and gap > 3000
    and not exists (select 1 from de0 where de0.enc = rg.enc and de0.ent = rg.entidad and de0.t_ms between rg.prev and rg.t_ms)), 0) pausas_ms,
  (select median(t) from (select min(g.t_ms) t from pi join golpes g on g.enc = pi.enc and g.dueno = pi.entidad and g.objetivo = pi.jefe
    where pi.nombre = p.nombre and g.t_ms >= 0 group by pi.enc)) primer_golpe_ms
from (select distinct nombre from pi) p;
create or replace temp table ruh as
select nombre, hab, count(*) usos, avg(dt) intervalo_ms from (
  select *, t_ms - lag(t_ms) over (partition by enc, entidad, hab order by t_ms) dt from ru where coalesce(parada, '') <> 'interrupted'
) group by all;

-- Buffs que da a los demás jugadores del grupo: tiempo activo medio sobre los que lo recibieron, uniendo
-- los tramos que se solapan (al refrescarlo) y recortando al intento.
create or replace temp table bt as
select l.nombre, l.enc, b.entidad receptor, (b.habilidad // 10000) * 10000 hab,
  greatest(b.desde_ms, 0) desde, least(coalesce(b.hasta_ms, l.dur * 1000), l.dur * 1000) hasta, l.dur
from pi l join buffs b on b.enc = l.enc and b.lanzador = l.entidad
join ji r on r.enc = b.enc and r.entidad = b.entidad and r.nombre <> l.nombre
where b.habilidad > 0;
create or replace temp table bu as   -- tramos unidos (islas) por buff y receptor
select nombre, enc, receptor, hab, dur, min(desde) desde, max(hasta) hasta from (
  select *, sum(nuevo) over (partition by nombre, enc, receptor, hab order by desde, hasta rows unbounded preceding) isla from (
    select *, case when desde > max(hasta) over (partition by nombre, enc, receptor, hab order by desde, hasta rows between unbounded preceding and 1 preceding) then 1 else 0 end nuevo
    from bt where hasta > desde)
) group by all;
create or replace temp table bd as
select nombre, hab, sum(hasta - desde) activo_ms, count(distinct receptor) receptores,
  (select sum(o.dur * 1000) from (select distinct b2.enc, b2.receptor, b2.dur from bu b2 where b2.nombre = bu.nombre and b2.hab = bu.hab) o) posible_ms
from bu group by nombre, hab;

-- Mecánicas: golpes directos que recibe el grupo, por habilidad (sin los ticks de daño en el tiempo, que siguen a un
-- golpe y contarían dos veces el mismo fallo). Una «ola» es cada vez que la habilidad sale: golpes de la misma
-- habilidad en el mismo intento separados por 1,5 s o menos. De cada jugador: en cuántas olas le dio y a cuántas
-- estuvo expuesto (las que le dieron y las que empezaron con él vivo: sin una muerte anterior que no tenga después
-- una resurrección). El alcance es la media de jugadores distintos a los que da cada ola. Regla deducida de los datos.
create or replace temp table mh as
select *, sum(nueva) over (partition by enc, habilidad order by t_ms, orden rows unbounded preceding) ola from (
  select pi.nombre, pi.enc, x.habilidad, x.t_ms, x.orden, x.dano,
    case when x.t_ms - lag(x.t_ms) over (partition by pi.enc, x.habilidad order by x.t_ms, x.orden) <= 1500 then 0 else 1 end nueva
  from pi join recibido x on x.enc = pi.enc and x.objetivo = pi.entidad
  where not coalesce(x.dot, false) and coalesce(x.habilidad, 0) <> 0);
create or replace temp table mo as   -- olas
select enc, habilidad, ola, min(t_ms) t_ms, count(distinct nombre) alcanzados from mh group by all;
create or replace temp table mm as   -- tramos en que cada jugador está muerto
select d.enc, d.nombre, d.t_ms desde,
  coalesce((select min(x.t_ms) from resurrecciones x where x.enc = d.enc and x.nombre = d.nombre and x.t_ms > d.t_ms), 9000000000000) hasta
from de0 d;
create or replace temp table mg as   -- golpes por habilidad y jugador
select habilidad, nombre, count(*) golpes, count(distinct enc || ':' || ola) olas, sum(dano) dano, max(dano) maximo from mh group by all;
create or replace temp table mx as   -- olas a las que estuvo expuesto cada jugador
select mo.habilidad, p.nombre, count(*) expuesto
from mo join (select distinct enc, nombre from pi) p on p.enc = mo.enc
where exists (select 1 from mh where mh.enc = mo.enc and mh.habilidad = mo.habilidad and mh.ola = mo.ola and mh.nombre = p.nombre)
  or not exists (select 1 from mm where mm.enc = mo.enc and mm.nombre = p.nombre and mo.t_ms > mm.desde and mo.t_ms < mm.hasta)
group by all;
create or replace temp table mk as   -- por habilidad
select habilidad, count(*) olas, rd1(avg(alcanzados)) alcance,
  (select count(*) from mh where mh.habilidad = mo.habilidad) golpes
from mo group by habilidad;

-- Repaso de cada muerte: los 10 s anteriores. Vida (% del máximo) 10 s antes y cada lectura desde entonces, como
-- [segundos respecto a la muerte, %], y su vida máxima (la de la última lectura); los golpes recibidos (los 12 últimos, uno a uno) con su total; la curación que
-- le llegó, por sanador y habilidad (las 5 mayores) con su total; lo que absorbieron sus escudos; cuántos compañeros
-- del grupo seguían vivos (y cuántos de ellos eran sanadores: clérigos y cantores), y sus defensivos.
-- Defensivo = habilidad que el jugador castea y que le pone un escudo a él mismo en esta raid; de cada uno, hace
-- cuántos segundos lo usó en ese intento (null = no lo había usado) y su recarga, que es la menor separación entre dos
-- usos suyos seguidos en la raid (null con menos de 3 usos). Las dos cosas son reglas deducidas de los datos.
create or replace temp table qd as   -- defensivos de cada jugador y su recarga deducida
select nombre, hab, case when count(*) >= 3 then min(dt) end recarga_ms from (
  select nombre, hab, t_ms - lag(t_ms) over (partition by enc, entidad, hab order by t_ms) dt
  from ru where coalesce(parada, '') <> 'interrupted') u
where exists (select 1 from pi join escudos e on e.enc = pi.enc and e.dueno = pi.entidad and e.objetivo = pi.entidad
              where pi.nombre = u.nombre and (e.habilidad // 10000) * 10000 = u.hab)
group by all;
create or replace temp table qr as
select d.intento, d.orden, json_object(
  'vida_10s', rd(least(100, coalesce((select arg_max(100 * v.vida / v.vida_max, v.t_ms) from vida v
      where v.enc = d.enc and v.entidad = d.ent and v.vida_max > 0 and v.t_ms <= d.t_ms - 10000), 100))),
  'vida', coalesce((select to_json(list(json_array(rd1((v.t_ms - d.t_ms) / 1000), rd(least(100, 100 * v.vida / v.vida_max))) order by v.t_ms))
      from vida v where v.enc = d.enc and v.entidad = d.ent and v.vida_max > 0 and v.t_ms > d.t_ms - 10000 and v.t_ms <= d.t_ms + 50), '[]'::json),
  'vida_max', coalesce((select arg_max(v.vida_max, v.t_ms) from vida v where v.enc = d.enc and v.entidad = d.ent and v.vida_max > 0 and v.t_ms <= d.t_ms + 50), 0),
  'golpes_10s', (select count(*) from recibido x where x.enc = d.enc and x.objetivo = d.ent and x.t_ms between d.t_ms - 10000 and d.t_ms + 50),
  'dano_10s', rd(coalesce((select sum(x.dano) from recibido x where x.enc = d.enc and x.objetivo = d.ent and x.t_ms between d.t_ms - 10000 and d.t_ms + 50), 0)),
  'golpes', coalesce((select to_json(list(json_object('t', rd1((t_ms - d.t_ms) / 1000), 'hab', coalesce(nullif(habilidad, 0)::varchar, ''),
        'dano', rd(dano), 'mit', mitigacion) order by t_ms, orden))
      from (select x.t_ms, x.orden, x.habilidad, x.dano, x.mitigacion from recibido x
            where x.enc = d.enc and x.objetivo = d.ent and x.t_ms between d.t_ms - 10000 and d.t_ms + 50
            order by x.t_ms desc, x.orden desc limit 12)), '[]'::json),
  'cura_10s', rd(coalesce((select sum(c.cantidad) from curaciones c where c.enc = d.enc and c.objetivo = d.ent and c.t_ms between d.t_ms - 10000 and d.t_ms), 0)),
  'curas', coalesce((select to_json(list(json_object('jugador', jugador, 'hab', hab, 'cantidad', rd(cantidad), 'n', n) order by cantidad desc, jugador, hab))
      from (select coalesce(o.nombre, '') jugador, coalesce(nullif(c.habilidad, 0)::varchar, '') hab, sum(c.cantidad) cantidad, count(*) n
            from curaciones c left join ji o on o.enc = c.enc and o.entidad = c.dueno
            where c.enc = d.enc and c.objetivo = d.ent and c.t_ms between d.t_ms - 10000 and d.t_ms
            group by all order by cantidad desc, jugador, hab limit 5)), '[]'::json),
  'escudo_10s', rd(coalesce((select sum(a.cantidad) from absorciones a where a.enc = d.enc and a.objetivo = d.ent and a.t_ms between d.t_ms - 10000 and d.t_ms), 0)),
  'companeros', (select count(*) from ji o where o.enc = d.enc and o.nombre <> d.nombre),
  'vivos', (select count(*) from ji o where o.enc = d.enc and o.nombre <> d.nombre
      and not exists (select 1 from mm where mm.enc = o.enc and mm.nombre = o.nombre and mm.desde < d.t_ms and mm.hasta > d.t_ms)),
  'sanadores', (select count(*) from ji o where o.enc = d.enc and o.nombre <> d.nombre and o.clase in ('cleric', 'chanter')
      and not exists (select 1 from mm where mm.enc = o.enc and mm.nombre = o.nombre and mm.desde < d.t_ms and mm.hasta > d.t_ms)),
  'defensivos', coalesce((select to_json(list(json_object('hab', qd.hab::varchar,
        'hace_s', (select rd1((d.t_ms - max(ru.t_ms)) / 1000) from ru where ru.enc = d.enc and ru.entidad = d.ent and ru.hab = qd.hab
                   and ru.t_ms <= d.t_ms and coalesce(ru.parada, '') <> 'interrupted'),
        'recarga_s', rd1(qd.recarga_ms / 1000)) order by qd.hab))
      from qd where qd.nombre = d.nombre), '[]'::json)
) repaso
from de0 d;

-- Ventanas de daño. Rotura = tramo en que la barra de aturdimiento del jefe está rota (recortado al intento; los de
-- menos de 1 s, que salen al acabar un intento, no cuentan). De cada jugador, en los intentos con rotura: daño al jefe
-- y segundos vivo dentro de las roturas y fuera de ellas, y en cuántas roturas estaba vivo al empezar. Debuffs = los
-- efectos de habilidades de clase que cada jugador mantiene sobre el jefe: % del tiempo de sus intentos que están
-- activos (uniendo los tramos que se solapan) y % del tiempo de rotura.
create or replace temp table vw as
select it.intento, it.enc, greatest(b.t_ms, 0) desde, least(b.hasta_ms, it.dur * 1000) hasta
from it join roturas b on b.enc = it.enc
where b.hasta_ms is not null and coalesce(b.npc, (select npc from r)) = (select npc from r)
  and least(b.hasta_ms, it.dur * 1000) - greatest(b.t_ms, 0) >= 1000;
create or replace temp table vj0 as   -- por jugador e intento con rotura
select pi.nombre, pi.dur * 1000 dur_ms, pi.dmg,
  coalesce((select sum(greatest(0, least(mm.hasta, pi.dur * 1000) - greatest(mm.desde, 0))) from mm where mm.enc = pi.enc and mm.nombre = pi.nombre), 0) muerto_ms,
  (select sum(vw.hasta - vw.desde) from vw where vw.enc = pi.enc) rot_ms,
  coalesce((select sum(greatest(0, least(mm.hasta, vw.hasta) - greatest(mm.desde, vw.desde))) from vw join mm on mm.enc = vw.enc
            where vw.enc = pi.enc and mm.nombre = pi.nombre), 0) muerto_rot_ms,
  (select count(*) from vw where vw.enc = pi.enc and not exists (select 1 from mm where mm.enc = vw.enc and mm.nombre = pi.nombre
            and mm.desde < vw.desde and mm.hasta > vw.desde)) presentes,
  (select count(*) from vw where vw.enc = pi.enc) roturas,
  coalesce((select sum(g.dano) from golpes g where g.enc = pi.enc and g.dueno = pi.entidad and g.objetivo = pi.jefe
            and exists (select 1 from vw where vw.enc = g.enc and g.t_ms >= vw.desde and g.t_ms < vw.hasta)), 0) dano_rot
from pi where exists (select 1 from vw where vw.enc = pi.enc);
create or replace temp table vj as
select nombre, sum(roturas) roturas, sum(presentes) presentes, sum(dano_rot) dano_rotura, sum(greatest(0, rot_ms - muerto_rot_ms)) / 1000 s_rotura,
  sum(dmg - dano_rot) dano_fuera, sum(greatest(0, dur_ms - muerto_ms - greatest(0, rot_ms - muerto_rot_ms))) / 1000 s_fuera
from vj0 group by nombre;
create or replace temp table vd0 as
select l.nombre, l.enc, (b.habilidad // 10000) * 10000 hab,
  greatest(b.desde_ms, 0) desde, least(coalesce(b.hasta_ms, l.dur * 1000), l.dur * 1000) hasta
from pi l join buffs b on b.enc = l.enc and b.lanzador = l.entidad and b.entidad = l.jefe
where b.habilidad between 11000000 and 19999999;
create or replace temp table vd1 as   -- tramos unidos (islas) por debuff
select nombre, enc, hab, min(desde) desde, max(hasta) hasta from (
  select *, sum(nuevo) over (partition by nombre, enc, hab order by desde, hasta rows unbounded preceding) isla from (
    select *, case when desde > max(hasta) over (partition by nombre, enc, hab order by desde, hasta rows between unbounded preceding and 1 preceding) then 1 else 0 end nuevo
    from vd0 where hasta > desde)
) group by nombre, enc, hab, isla;
create or replace temp table vd as
select nombre, hab, sum(hasta - desde) activo_ms,
  (select sum(pi.dur * 1000) from pi where pi.nombre = vd1.nombre) posible_ms,
  coalesce((select sum(greatest(0, least(x.hasta, vw.hasta) - greatest(x.desde, vw.desde))) from vd1 x join vw on vw.enc = x.enc
            where x.nombre = vd1.nombre and x.hab = vd1.hab), 0) rot_ms,
  (select sum(vw.hasta - vw.desde) from vw join pi on pi.enc = vw.enc where pi.nombre = vd1.nombre) rot_posible_ms
from vd1 group by nombre, hab;

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
      'clase_id', clase_id, 'servidor', servidor, 'gs', gs, 'cp', cp, 'dps', dps, 'hps', hps, 'dano_recibido', dano_recibido, 'muertes', muertes,
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
          'origen', origen, 'golpe_max', rd(golpe_max), 'vida_5s', rd(vida_5s), 'vida_1s', rd(vida_1s),
          'dano_5s', rd(dano_5s), 'cura_5s', rd(cura_5s),
          'repaso', (select qr.repaso from qr where qr.intento = de.intento and qr.orden = de.orden)) order by intento, orden))
        from de where de.nombre = jv.jugador), '[]'::json),
      'apoyo', (select json_object('curacion', rd(ap.curacion), 'escudos', rd(ap.escudos), 'absorbido', rd(ap.absorbido),
          'cura_hab', coalesce((select to_json(list(json_object('habilidad', habilidad::varchar, 'cantidad', rd(cantidad),
              'pct', rd1(100 * cantidad / greatest(1, ap.curacion)), 'golpes', golpes) order by cantidad desc, habilidad))
            from (select * from dcu where dcu.nombre = jv.jugador order by cantidad desc, habilidad limit 8)), '[]'::json),
          'cura_obj', coalesce((select to_json(list(json_object('jugador', objetivo, 'cantidad', rd(cantidad),
              'pct', rd1(100 * cantidad / greatest(1, ap.curacion))) order by cantidad desc, objetivo))
            from dco where dco.nombre = jv.jugador), '[]'::json),
          'escudo_hab', coalesce((select to_json(list(json_object('habilidad', habilidad::varchar, 'cantidad', rd(cantidad)) order by cantidad desc, habilidad))
            from (select * from des where des.nombre = jv.jugador order by cantidad desc, habilidad limit 5)), '[]'::json))
        from ap where ap.nombre = jv.jugador),
      'supervivencia', (select json_object('golpes', sv.golpes, 'cura_recibida', rd(sv.cura_recibida), 'escudo_recibido', rd(sv.escudo_recibido),
          'resurrecciones', sv.resurrecciones, 'bajo30_pct', rd1(100 * sv.bajo30_ms / greatest(1, sv.vivo_ms)),
          'mitigados', coalesce((select json_group_object(mitigacion, n) from smi where smi.nombre = jv.jugador), '{}'::json),
          'evitados', coalesce((select json_group_object(resultado, n) from sev where sev.nombre = jv.jugador), '{}'::json))
        from sv where sv.nombre = jv.jugador),
      'rotacion', (select json_object('usos', ro.usos, 'interrumpidos', ro.interrumpidos, 'vivo_s', rd(sv.vivo_ms / 1000),
          'usos_min', rd1(60000 * ro.usos / greatest(1, sv.vivo_ms)), 'pausas_pct', rd1(100 * ro.pausas_ms / greatest(1, sv.vivo_ms)),
          'primer_golpe_s', rd1(ro.primer_golpe_ms / 1000),
          'usos_hab', coalesce((select to_json(list(json_object('habilidad', hab::varchar, 'usos', usos, 'intervalo_s', rd1(intervalo_ms / 1000)) order by usos desc, hab))
            from (select * from ruh where ruh.nombre = jv.jugador order by usos desc, hab limit 12)), '[]'::json),
          'buffs', coalesce((select to_json(list(json_object('habilidad', hab::varchar, 'activo_pct', rd1(100 * activo_ms / greatest(1, posible_ms)),
              'receptores', receptores) order by activo_ms desc, hab))
            from (select * from bd where bd.nombre = jv.jugador order by activo_ms desc, hab limit 8)), '[]'::json))
        from ro join sv on sv.nombre = ro.nombre where ro.nombre = jv.jugador)
    )) from jv),
  'mecanicas', coalesce((select to_json(list(json_object('habilidad', habilidad::varchar, 'golpes', golpes, 'olas', olas, 'alcance', alcance,
      'jugadores', (select to_json(list(json_object('jugador', mx.nombre, 'golpes', coalesce(mg.golpes, 0), 'olas', coalesce(mg.olas, 0),
          'expuesto', mx.expuesto, 'dano', rd(coalesce(mg.dano, 0)), 'golpe_max', rd(coalesce(mg.maximo, 0)))
          order by coalesce(mg.golpes, 0) desc, mx.nombre))
        from mx left join mg on mg.habilidad = mx.habilidad and mg.nombre = mx.nombre where mx.habilidad = mk.habilidad))
      order by golpes desc, habilidad))
    from (select * from mk order by golpes desc, habilidad limit 40) mk), '[]'::json),
  'ventanas', json_object(
    'roturas', coalesce((select to_json(list(json_object('intento', intento, 'desde', rd1(desde / 1000), 'hasta', rd1(hasta / 1000)) order by intento, desde)) from vw), '[]'::json),
    'jugadores', coalesce((select to_json(list(json_object('jugador', nombre, 'roturas', roturas, 'presentes', presentes, 'dano_rotura', rd(dano_rotura),
        's_rotura', rd1(s_rotura), 'dano_fuera', rd(dano_fuera), 's_fuera', rd1(s_fuera)) order by nombre)) from vj), '[]'::json),
    'debuffs', coalesce((select to_json(list(json_object('jugador', nombre, 'habilidad', hab::varchar, 'activo_pct', rd1(100 * activo_ms / greatest(1, posible_ms)),
        'rotura_pct', case when rot_posible_ms > 0 then rd1(100 * rot_ms / rot_posible_ms) end) order by nombre, activo_ms desc, hab))
      from (select * from vd where 20 * activo_ms >= posible_ms order by activo_ms desc, nombre, hab limit 80)), '[]'::json))
) as raid_json;
