-- Vistas para analizar raids. Siguen las mismas reglas que tools/extraer-raid.ps1, para que las cifras
-- coincidan con raids/<slug>/data.json.

-- Intentos de cada raid: encuentros de su run contra el jefe principal de más de 5 s, numerados por orden.
create or replace view intentos as
select r.slug raid, row_number() over (partition by r.slug order by e.inicio) intento, e.id enc, e.inicio, e.duracion_s, e.matado
from raids r join runs ru on ru.id = r.run join encuentros e on e.log = ru.log and e.npc = r.npc and e.duracion_s > 5;

-- Jefe de cada encuentro: el npc jefe que más daño recibió.
create or replace view jefe_enc as
select enc, entidad, npc, vida_max, dano from (
  select *, row_number() over (partition by enc order by dano desc) n from npcs where jefe
) where n = 1;

-- Grupo de cada raid: jugadores de tu grupo (o tú) que hicieron daño en algún intento.
create or replace view grupo as
select distinct i.raid, j.nombre
from intentos i join jugadores j on j.enc = i.enc and (j.grupo or j.yo)
where exists (select 1 from golpes g where g.enc = i.enc and g.dueno = j.entidad and g.dano > 0)
   or j.yo;

-- Jugadores del grupo en cada intento, con su entidad (para unir con golpes, curaciones, recibido…). Si un jugador
-- sale dos veces en un encuentro (salió y volvió a entrar), la entidad con más eventos, como en db/raid.sql.
create or replace view jugador_intento as
select i.raid, i.intento, i.enc, i.duracion_s, j.entidad, j.nombre, j.clase, j.gs, j.cp
from intentos i join jugadores j on j.enc = i.enc join grupo gr on gr.raid = i.raid and gr.nombre = j.nombre
left join (select enc, ent, count(*) n from (
    select enc, dueno ent from golpes union all select enc, objetivo from recibido union all select enc, dueno from curaciones) group by all
  ) ev on ev.enc = j.enc and ev.ent = j.entidad
qualify row_number() over (partition by i.raid, i.enc, j.nombre order by coalesce(ev.n, 0) desc, j.entidad desc) = 1;

-- Muertes del grupo en cada intento (desde el inicio del combate), en segundos.
create or replace view muertes_intento as
select i.raid, i.intento, m.enc, m.t_ms / 1000.0 t_s, m.nombre, m.npc, m.habilidad
from intentos i join muertes m on m.enc = i.enc join grupo gr on gr.raid = i.raid and gr.nombre = m.nombre
where m.t_ms >= 0;

-- Nombre legible de una habilidad o npc (apodo > nombre > id).
create or replace macro nombre_hab(hab_id) as coalesce(
  (select coalesce(apodo_es, es) from nombres where tipo = 'habilidad' and nombres.id = hab_id), 'Habilidad ' || hab_id);
create or replace macro nombre_npc(npc_id) as coalesce(
  (select coalesce(apodo_es, es) from nombres where tipo = 'npc' and nombres.id = npc_id), 'NPC ' || npc_id);
