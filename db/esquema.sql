-- Esquema de la base de datos de DPS Aion (DuckDB). Lo carga tools/cargar-db.ps1 desde el archivo
-- de Questlog (db/archivo/), así que se puede borrar aion.duckdb y reconstruirlo cuando haga falta.
-- Tiempos: *_ms son milisegundos desde el inicio del encuentro (fight.startedAt); inicio/entrada son fechas.
-- Entidades: dentro de un encuentro, cada jugador o npc tiene un número de entidad (jugadores.entidad, npcs.entidad).

-- Runs de mazmorra (runs/<id>.json)
create table if not exists runs (
  id varchar primary key, log varchar, mazmorra integer, personaje varchar,
  entrada timestamptz, salida timestamptz, limite_ms bigint, muertes integer
);
create table if not exists run_grupo (            -- grupo al entrar (party)
  run varchar, nombre varchar, servidor integer, clase varchar, nivel integer, gs integer, cp integer
);
create table if not exists run_miembros (         -- resumen de Questlog por miembro en toda la run
  run varchar, nombre varchar, servidor integer, clase varchar, yo boolean, gs integer, cp integer,
  dano bigint, curacion bigint, dano_recibido bigint, muertes integer, golpes integer,
  crit_pct double, espalda_pct double, perfecto_pct double, dps double, hps double
);
create table if not exists run_build (            -- habilidades equipadas del personaje propio
  run varchar, habilidad integer, nivel integer, especializaciones integer[], usada boolean
);

-- Encuentros (encounters/<id>.json.gz): cada pull a un jefe o grupo de npcs
create table if not exists encuentros (
  id varchar primary key, log varchar, inicio timestamptz, inicio_ms bigint, duracion_s double, dps double,
  npc integer, matado boolean, fin varchar, personaje varchar, version integer
);
create table if not exists jugadores (
  enc varchar, entidad integer, nombre varchar, servidor integer, clase varchar, nivel integer,
  gs integer, cp integer, grupo boolean, yo boolean, enemigo boolean, legion varchar
);
create table if not exists npcs (
  enc varchar, entidad integer, npc integer, jefe boolean, vida_max bigint, vida_inicio bigint, vida_fin bigint,
  dano bigint, stagger_max integer, roto boolean, primero_ms bigint, ultimo_ms bigint, murio_ms bigint, berserk_ms bigint
);

-- Eventos del medidor (fight.packed)
create table if not exists golpes (               -- daño hecho
  enc varchar, t_ms bigint, actor integer, dueno integer, objetivo integer, habilidad integer, dano bigint,
  golpes integer, dot boolean, critico boolean, espalda boolean, frente boolean, perfecto boolean, fuerte boolean,
  orden integer                                   -- posición en el registro (desempata eventos del mismo ms)
);
create table if not exists recibido (             -- daño recibido
  enc varchar, t_ms bigint, actor integer, dueno integer, objetivo integer, habilidad integer, dano bigint,
  dot boolean, critico boolean, mitigacion varchar, orden integer
);
create table if not exists curaciones (enc varchar, t_ms bigint, dueno integer, objetivo integer, habilidad integer, cantidad bigint);
create table if not exists escudos (enc varchar, t_ms bigint, dueno integer, objetivo integer, habilidad integer, buff integer, cantidad bigint);
create table if not exists absorciones (enc varchar, t_ms bigint, dueno integer, objetivo integer, habilidad integer, buff integer, cantidad bigint);
create table if not exists fallos (enc varchar, t_ms bigint, dueno integer, objetivo integer, habilidad integer, resultado varchar);
create table if not exists usos (                 -- cada vez que alguien usa una habilidad
  enc varchar, t_ms bigint, actor integer, dueno integer, objetivo integer, habilidad integer, accion integer,
  dano bigint, critico boolean, parada varchar
);
create table if not exists buffs (
  enc varchar, entidad integer, buff integer, grupo integer, lanzador integer, habilidad integer, nivel integer,
  desde_ms bigint, hasta_ms bigint, activo boolean
);
create table if not exists vida (enc varchar, t_ms bigint, entidad integer, vida bigint, vida_max bigint);

-- Mecánicas (fight.mechanics)
create table if not exists muertes (enc varchar, t_ms bigint, nombre varchar, servidor integer, npc integer, habilidad integer, orden integer);
create table if not exists resurrecciones (enc varchar, t_ms bigint, nombre varchar, servidor integer);
create table if not exists roturas (enc varchar, t_ms bigint, npc integer, hasta_ms bigint);
create table if not exists casteos (              -- lo que castea cada npc: tipo = barra, casteo o telegrafiado
  enc varchar, t_ms bigint, npc integer, habilidad integer, tipo varchar, duracion_ms bigint, objetivo varchar
);

-- Raids publicadas en la web (raids/<slug>/data.json) y privadas (_privado/)
create table if not exists raids (slug varchar primary key, run varchar, npc integer, fecha timestamptz, publicada boolean);

-- Nombres de habilidades y npcs (nombres.json / nombres.en.json)
create table if not exists nombres (tipo varchar, id integer, es varchar, en varchar, apodo_es varchar, apodo_en varchar, icono varchar);
