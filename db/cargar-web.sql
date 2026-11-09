-- Nombres de habilidades y npcs del repo (nombres.json / nombres.en.json, la semilla de la web).
-- tools/cargar-db.ps1 lo ejecuta desde la carpeta del repo y lo recarga entero cada vez.
-- La tabla raids ya no se llena desde archivos (las raids viven en la base de la web desde el corte del 9/11/2026):
-- tools/extraer-raid.ps1 inserta la raid que extrae y de ahí la leen las vistas y db/raid.sql.

delete from nombres;
insert into nombres
with es as (select json j from read_json_objects('nombres.json')),
     en as (select json j from read_json_objects('nombres.en.json')),
     ids as (
       select 'habilidad' tipo, unnest(json_keys(j -> 'habilidades')) id from es
       union select 'habilidad', unnest(json_keys(j -> 'apodos')) from es
       union select 'npc', unnest(json_keys(j -> 'npcs')) from es
     )
select tipo, id::integer,
  nullif(json_extract_string(es.j, '$.' || (case tipo when 'npc' then 'npcs' else 'habilidades' end) || '."' || id || '"'), ''),
  nullif(json_extract_string(en.j, '$.' || (case tipo when 'npc' then 'npcs' else 'habilidades' end) || '."' || id || '"'), ''),
  nullif(json_extract_string(es.j, '$.apodos."' || id || '"'), ''),
  nullif(json_extract_string(en.j, '$.apodos."' || id || '"'), ''),
  nullif(json_extract_string(es.j, '$.iconos."' || id || '"'), '')
from ids, es, en
where try_cast(id as integer) is not null;
