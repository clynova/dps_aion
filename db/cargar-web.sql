-- Datos de la web que viven en el repo: raids publicadas o privadas y nombres de habilidades y npcs.
-- tools/cargar-db.ps1 lo ejecuta desde la carpeta del repo y lo recarga entero cada vez.

delete from raids;
insert into raids
select json -> 'meta' ->> 'slug', json -> 'meta' ->> 'run', (json -> 'meta' ->> 'npc')::integer,
  (json -> 'meta' ->> 'fecha')::timestamptz, filename not like '%_privado%'
from read_json_objects('*/*/data.json', filename = true, maximum_object_size = 67108864)
-- un solo patrón: con una lista, DuckDB falla si _privado/ no existe o está vacía
where regexp_matches(filename, '^(\.[/\\])?(raids|_privado)[/\\]');

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
