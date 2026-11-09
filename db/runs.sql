-- Runs de Questlog con su jefe principal y el número de jugadores (lista del asistente de subida).
-- Jefe principal: el npc con más intentos de más de 5 s; en empate, el que se intentó más tarde. Es la misma regla que
-- tools/extraer-raid.ps1 ($runsSql); si cambia aquí, cambia allí.
-- Necesita: runs y run_grupo (cargar-runs.sql) y la tabla temporal indice(id, log, npc, duracion_s, inicio_ms),
-- que se llena con encounters/index.json (no hace falta descomprimir ningún encuentro para listar).
with e as (
  select ru.id, ru.mazmorra, epoch_ms(ru.entrada) entrada, i.npc, i.duracion_s, i.inicio_ms
  from runs ru join indice i on i.log = ru.log
), jefes as (
  select id, npc, count(*) n, max(inicio_ms) ultimo from e where duracion_s > 5 group by id, npc
)
select ru.id, ru.log, ru.mazmorra, epoch_ms(ru.entrada) entrada,
  (select count(*) from e where e.id = ru.id)::int encuentros,
  (select arg_max(npc, n * 1e13 + ultimo) from jefes j where j.id = ru.id) jefe,
  (select count(*) from jefes j where j.id = ru.id and j.npc = (select arg_max(npc, n * 1e13 + ultimo) from jefes k where k.id = ru.id))::int intentos_jefe,
  (select count(*) from run_grupo g where g.run = ru.id)::int jugadores
from runs ru
order by ru.entrada desc;
