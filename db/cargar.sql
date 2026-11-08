-- Pasa a las tablas de esquema.sql lo que tools/cargar-db.ps1 deja en la tabla temporal
--   raw(id, log, fight json, overview json)   encuentros nuevos (las runs van aparte, en cargar-runs.sql)
-- Las columnas de fight.packed vienen como {kind, values}: "times" va en diferencias (hay que acumular),
-- "flags" son 0/1 y "values" van tal cual.

create or replace temp macro acum(v, k, p, i) as
  case when k = 'times' then sum(v) over (partition by p order by i rows between unbounded preceding and current row) else v end;
create or replace temp macro col(c, nombre) as (c -> nombre -> 'values');
create or replace temp macro tipo(c, nombre) as (c -> nombre ->> 'kind');

create or replace temp table src as
  select id enc, (fight ->> 'startedAt')::bigint t0, fight -> 'packed' p, fight -> 'mechanics' m, fight from raw;

-- Encuentros, jugadores y npcs
insert into encuentros
select id, log, make_timestamptz(((overview ->> 'startedAt')::bigint) * 1000), (fight ->> 'startedAt')::bigint,
  (overview ->> 'durationSeconds')::double, (overview ->> 'npc')::integer, (overview ->> 'killed')::boolean,
  overview ->> 'end', overview ->> 'character', (fight ->> 'version')::integer
from raw;

insert into jugadores
select enc, (x ->> 'entity')::integer, x ->> 'name', (x ->> 'server')::integer, x ->> 'class', (x ->> 'level')::integer,
  (x ->> 'gearScore')::integer, (x ->> 'combatPower')::integer, coalesce((x ->> 'party')::boolean, false),
  coalesce((x ->> 'self')::boolean, false), coalesce((x ->> 'enemy')::boolean, false), x ->> 'legion'
from (select enc, unnest(from_json(fight -> 'players', '["json"]')) x from src);

insert into npcs
select enc, (x ->> 'entity')::integer, (x ->> 'npc')::integer, coalesce((x ->> 'boss')::boolean, false),
  (x ->> 'maxHp')::bigint, (x ->> 'startHp')::bigint, (x ->> 'hp')::bigint, (x ->> 'damage')::bigint,
  (x -> 'stagger' ->> 'max')::integer, (x -> 'stagger' ->> 'broken')::boolean,
  (x ->> 'firstAt')::bigint - t0, (x ->> 'lastAt')::bigint - t0, (x ->> 'died')::bigint - t0, (x ->> 'berserkAt')::bigint - t0
from (select enc, t0, unnest(from_json(fight -> 'npcs', '["json"]')) x from src);

-- Eventos del medidor. Primero se sacan las listas tipadas de cada encuentro a una tabla temporal t
-- (sin el JSON, que si no se copia en cada fila al desplegar) y luego se despliegan con unnest.

-- Golpes (daño hecho)
create or replace temp table t as select enc, t0, tipo(c, 'at') k_at, tipo(c, 'actor') k_actor, tipo(c, 'owner') k_dueno, tipo(c, 'target') k_obj,
  col(c, 'at')::bigint[] ts, col(c, 'actor')::bigint[] actor, col(c, 'owner')::bigint[] dueno, col(c, 'target')::bigint[] objetivo,
  col(c, 'skill')::bigint[] habilidad, col(c, 'damage')::bigint[] dano, col(c, 'hits')::bigint[] golpes, col(c, 'overTime')::bigint[] dot,
  col(c, 'critical')::bigint[] critico, col(c, 'back')::bigint[] espalda, col(c, 'front')::bigint[] frente,
  col(c, 'perfect')::bigint[] perfecto, col(c, 'hardHit')::bigint[] fuerte
from (select enc, t0, p -> 'hits' -> 'columns' c from src where (p -> 'hits' ->> 'length')::integer > 0);
insert into golpes
select enc, acum(ts, k_at, enc, i) - t0, acum(actor, k_actor, enc, i), acum(dueno, k_dueno, enc, i), acum(objetivo, k_obj, enc, i),
  habilidad, dano, golpes, dot <> 0, critico <> 0, espalda <> 0, frente <> 0, perfecto <> 0, fuerte <> 0
from (select enc, t0, k_at, k_actor, k_dueno, k_obj, unnest(range(len(ts))) i, unnest(ts) ts, unnest(actor) actor, unnest(dueno) dueno,
  unnest(objetivo) objetivo, unnest(habilidad) habilidad, unnest(dano) dano, unnest(golpes) golpes, unnest(dot) dot, unnest(critico) critico,
  unnest(espalda) espalda, unnest(frente) frente, unnest(perfecto) perfecto, unnest(fuerte) fuerte from t);

-- Daño recibido
create or replace temp table t as select enc, t0, tipo(c, 'at') k_at,
  col(c, 'at')::bigint[] ts, col(c, 'actor')::bigint[] actor, col(c, 'owner')::bigint[] dueno, col(c, 'target')::bigint[] objetivo,
  col(c, 'skill')::bigint[] habilidad, col(c, 'damage')::bigint[] dano, col(c, 'overTime')::bigint[] dot,
  col(c, 'critical')::bigint[] critico, col(c, 'mitigation')::varchar[] mitigacion
from (select enc, t0, p -> 'taken' -> 'columns' c from src where (p -> 'taken' ->> 'length')::integer > 0);
insert into recibido
select enc, acum(ts, k_at, enc, i) - t0, actor, dueno, objetivo, habilidad, dano, dot <> 0, critico <> 0, mitigacion
from (select enc, t0, k_at, unnest(range(len(ts))) i, unnest(ts) ts, unnest(actor) actor, unnest(dueno) dueno, unnest(objetivo) objetivo,
  unnest(habilidad) habilidad, unnest(dano) dano, unnest(dot) dot, unnest(critico) critico, unnest(mitigacion) mitigacion from t);

-- Curaciones
create or replace temp table t as select enc, t0, tipo(c, 'at') k_at,
  col(c, 'at')::bigint[] ts, col(c, 'owner')::bigint[] dueno, col(c, 'target')::bigint[] objetivo,
  col(c, 'skill')::bigint[] habilidad, col(c, 'amount')::bigint[] cantidad
from (select enc, t0, p -> 'heals' -> 'columns' c from src where (p -> 'heals' ->> 'length')::integer > 0);
insert into curaciones
select enc, acum(ts, k_at, enc, i) - t0, dueno, objetivo, habilidad, cantidad
from (select enc, t0, k_at, unnest(range(len(ts))) i, unnest(ts) ts, unnest(dueno) dueno, unnest(objetivo) objetivo,
  unnest(habilidad) habilidad, unnest(cantidad) cantidad from t);

-- Escudos y absorciones (misma forma)
create or replace temp table t as select enc, t0, tipo(c, 'at') k_at,
  col(c, 'at')::bigint[] ts, col(c, 'owner')::bigint[] dueno, col(c, 'target')::bigint[] objetivo,
  col(c, 'skill')::bigint[] habilidad, col(c, 'buff')::bigint[] buff, col(c, 'amount')::bigint[] cantidad
from (select enc, t0, p -> 'shields' -> 'columns' c from src where (p -> 'shields' ->> 'length')::integer > 0);
insert into escudos
select enc, acum(ts, k_at, enc, i) - t0, dueno, objetivo, habilidad, buff, cantidad
from (select enc, t0, k_at, unnest(range(len(ts))) i, unnest(ts) ts, unnest(dueno) dueno, unnest(objetivo) objetivo,
  unnest(habilidad) habilidad, unnest(buff) buff, unnest(cantidad) cantidad from t);

create or replace temp table t as select enc, t0, tipo(c, 'at') k_at,
  col(c, 'at')::bigint[] ts, col(c, 'owner')::bigint[] dueno, col(c, 'target')::bigint[] objetivo,
  col(c, 'skill')::bigint[] habilidad, col(c, 'buff')::bigint[] buff, col(c, 'amount')::bigint[] cantidad
from (select enc, t0, p -> 'absorbs' -> 'columns' c from src where (p -> 'absorbs' ->> 'length')::integer > 0);
insert into absorciones
select enc, acum(ts, k_at, enc, i) - t0, dueno, objetivo, habilidad, buff, cantidad
from (select enc, t0, k_at, unnest(range(len(ts))) i, unnest(ts) ts, unnest(dueno) dueno, unnest(objetivo) objetivo,
  unnest(habilidad) habilidad, unnest(buff) buff, unnest(cantidad) cantidad from t);

-- Fallos (esquivas, bloqueos…)
create or replace temp table t as select enc, t0, tipo(c, 'at') k_at,
  col(c, 'at')::bigint[] ts, col(c, 'owner')::bigint[] dueno, col(c, 'target')::bigint[] objetivo,
  col(c, 'skill')::bigint[] habilidad, col(c, 'outcome')::varchar[] resultado
from (select enc, t0, p -> 'misses' -> 'columns' c from src where (p -> 'misses' ->> 'length')::integer > 0);
insert into fallos
select enc, acum(ts, k_at, enc, i) - t0, dueno, objetivo, habilidad, resultado
from (select enc, t0, k_at, unnest(range(len(ts))) i, unnest(ts) ts, unnest(dueno) dueno, unnest(objetivo) objetivo,
  unnest(habilidad) habilidad, unnest(resultado) resultado from t);

-- Usos de habilidades
create or replace temp table t as select enc, t0, tipo(c, 'at') k_at,
  col(c, 'at')::bigint[] ts, col(c, 'actor')::bigint[] actor, col(c, 'owner')::bigint[] dueno, col(c, 'target')::bigint[] objetivo,
  col(c, 'skill')::bigint[] habilidad, col(c, 'action')::bigint[] accion, col(c, 'damage')::bigint[] dano,
  col(c, 'critical')::bigint[] critico, col(c, 'stop')::varchar[] parada
from (select enc, t0, p -> 'casts' -> 'columns' c from src where (p -> 'casts' ->> 'length')::integer > 0);
insert into usos
select enc, acum(ts, k_at, enc, i) - t0, actor, dueno, objetivo, habilidad, accion, dano, critico <> 0, parada
from (select enc, t0, k_at, unnest(range(len(ts))) i, unnest(ts) ts, unnest(actor) actor, unnest(dueno) dueno, unnest(objetivo) objetivo,
  unnest(habilidad) habilidad, unnest(accion) accion, unnest(dano) dano, unnest(critico) critico, unnest(parada) parada from t);

-- Buffs: desde y hasta van acumulados por separado
create or replace temp table t as select enc, t0, tipo(c, 'from') k_desde, tipo(c, 'to') k_hasta,
  col(c, 'entity')::bigint[] entidad, col(c, 'buff')::bigint[] buff, col(c, 'group')::bigint[] grupo, col(c, 'caster')::bigint[] lanzador,
  col(c, 'skill')::bigint[] habilidad, col(c, 'level')::bigint[] nivel, col(c, 'from')::hugeint[] desde, col(c, 'to')::hugeint[] hasta,
  col(c, 'running')::bigint[] activo
from (select enc, t0, p -> 'buffs' -> 'columns' c from src where (p -> 'buffs' ->> 'length')::integer > 0);
insert into buffs
select enc, entidad, buff, grupo, lanzador, habilidad, nivel,
  (acum(desde, k_desde, enc, i) - t0)::bigint, (acum(hasta, k_hasta, enc, i) - t0)::bigint, activo <> 0
from (select enc, t0, k_desde, k_hasta, unnest(range(len(entidad))) i, unnest(entidad) entidad, unnest(buff) buff, unnest(grupo) grupo,
  unnest(lanzador) lanzador, unnest(habilidad) habilidad, unnest(nivel) nivel, unnest(desde) desde, unnest(hasta) hasta, unnest(activo) activo from t);

-- Vida de cada entidad a lo largo del combate
create or replace temp table t as select enc, t0, tipo(c, 'at') k_at,
  col(c, 'at')::bigint[] ts, col(c, 'entity')::bigint[] entidad, col(c, 'hp')::bigint[] vida, col(c, 'maxHp')::bigint[] vida_max
from (select enc, t0, p -> 'hp' -> 'columns' c from src where (p -> 'hp' ->> 'length')::integer > 0);
insert into vida
select enc, acum(ts, k_at, enc, i) - t0, entidad, vida, vida_max
from (select enc, t0, k_at, unnest(range(len(ts))) i, unnest(ts) ts, unnest(entidad) entidad, unnest(vida) vida, unnest(vida_max) vida_max from t);
drop table t;

-- Mecánicas
insert into muertes
select enc, (x ->> 'at')::bigint - t0, x ->> 'name', (x ->> 'server')::integer, (x ->> 'npc')::integer, (x ->> 'skill')::integer
from (select enc, t0, unnest(from_json(m -> 'deaths', '["json"]')) x from src);

insert into resurrecciones
select enc, (x ->> 'at')::bigint - t0, x -> 'player' ->> 'name', (x -> 'player' ->> 'server')::integer
from (select enc, t0, unnest(from_json(m -> 'resurrects', '["json"]')) x from src);

insert into roturas
select enc, (x ->> 'at')::bigint - t0, (x ->> 'npc')::integer, (x ->> 'until')::bigint - t0
from (select enc, t0, unnest(from_json(m -> 'breaks', '["json"]')) x from src);

insert into casteos
select enc, (x ->> 'at')::bigint - t0, (x ->> 'npc')::integer, (x ->> 'skill')::integer, tipo,
  coalesce((x ->> 'castMs')::bigint, (x ->> 'durationMs')::bigint), x -> 'target' ->> 'name'
from (
  select enc, t0, 'barra' tipo, unnest(from_json(m -> 'castBars', '["json"]')) x from src
  union all select enc, t0, 'casteo', unnest(from_json(m -> 'casts', '["json"]')) from src
  union all select enc, t0, 'telegrafiado', unnest(from_json(m -> 'telegraphs', '["json"]')) from src
);

drop table src;
