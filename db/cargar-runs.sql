-- Runs: tools/cargar-db.ps1 las recarga enteras desde db/archivo/runs (son pocas y la run en curso cambia).
-- Lee la tabla temporal raw_runs(id, j json).

insert into runs
select id, j ->> 'log', (j ->> 'dungeon')::integer, j ->> 'character',
  make_timestamptz(((j ->> 'enteredAt')::bigint) * 1000), make_timestamptz(((j ->> 'leftAt')::bigint) * 1000),
  (j ->> 'limitMs')::bigint, (j ->> 'deaths')::integer
from raw_runs;

insert into run_grupo
select id, x ->> 'name', (x ->> 'server')::integer, x ->> 'class', (x ->> 'level')::integer, (x ->> 'gearScore')::integer, (x ->> 'combatPower')::integer
from (select id, unnest(from_json(j -> 'party', '["json"]')) x from raw_runs);

insert into run_miembros
select id, x ->> 'name', (x ->> 'server')::integer, x ->> 'class', coalesce((x ->> 'self')::boolean, false),
  (x ->> 'gearScore')::integer, (x ->> 'combatPower')::integer, (x ->> 'damage')::bigint, (x ->> 'healing')::bigint,
  (x ->> 'damageTaken')::bigint, (x ->> 'deaths')::integer, (x ->> 'hits')::integer, (x ->> 'critRate')::double,
  (x ->> 'backRate')::double, (x ->> 'perfectRate')::double, (x ->> 'runDps')::double, (x ->> 'runHps')::double
from (select id, unnest(from_json(j -> 'members', '["json"]')) x from raw_runs);

insert into run_build
select id, (x ->> 'skill')::integer, (x ->> 'level')::integer, from_json(x -> 'specializations', '["integer"]'), (x ->> 'used')::boolean
from (select id, unnest(from_json(j -> 'build', '["json"]')) x from raw_runs);
