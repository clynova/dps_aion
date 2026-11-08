CREATE TYPE "public"."rol" AS ENUM('propietario', 'admin', 'publicador', 'miembro');--> statement-breakpoint
CREATE TYPE "public"."visibilidad" AS ENUM('privada', 'enlace', 'publica');--> statement-breakpoint
CREATE TYPE "public"."origen_raid" AS ENUM('navegador', 'pc', 'migracion');--> statement-breakpoint
CREATE TYPE "public"."tipo_desglose" AS ENUM('dano', 'recibido', 'cura', 'escudo', 'casteo', 'buff');--> statement-breakpoint
CREATE TYPE "public"."idioma" AS ENUM('es', 'en');--> statement-breakpoint
CREATE TYPE "public"."tipo_nombre" AS ENUM('habilidad', 'npc');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grupos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"visible" boolean DEFAULT false NOT NULL,
	"visibilidad_defecto" "visibilidad" DEFAULT 'privada' NOT NULL,
	"guardar_brutos" boolean DEFAULT false NOT NULL,
	"discord_webhook_cifrado" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	CONSTRAINT "grupos_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "invitaciones" (
	"codigo" text PRIMARY KEY NOT NULL,
	"grupo_id" uuid NOT NULL,
	"rol" "rol" DEFAULT 'miembro' NOT NULL,
	"caduca" timestamp with time zone,
	"usos_max" integer,
	"usos" integer DEFAULT 0 NOT NULL,
	"revocada" boolean DEFAULT false NOT NULL,
	"creada_por" text,
	"creada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitaciones_rol_no_propietario" CHECK ("invitaciones"."rol" <> 'propietario')
);
--> statement-breakpoint
CREATE TABLE "miembros" (
	"grupo_id" uuid NOT NULL,
	"usuario_id" text NOT NULL,
	"rol" "rol" NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "miembros_grupo_id_usuario_id_pk" PRIMARY KEY("grupo_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "tokens_api" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"hash" text NOT NULL,
	"ultimo_uso" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	"revocado" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tokens_api_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "casteos_jefe" (
	"raid_id" uuid NOT NULL,
	"intento" integer NOT NULL,
	"orden" integer NOT NULL,
	"t" double precision NOT NULL,
	"habilidad" text NOT NULL,
	CONSTRAINT "casteos_jefe_raid_id_intento_orden_pk" PRIMARY KEY("raid_id","intento","orden")
);
--> statement-breakpoint
CREATE TABLE "curva" (
	"raid_id" uuid NOT NULL,
	"intento" integer NOT NULL,
	"orden" integer NOT NULL,
	"t" double precision NOT NULL,
	"progreso" double precision NOT NULL,
	CONSTRAINT "curva_raid_id_intento_orden_pk" PRIMARY KEY("raid_id","intento","orden")
);
--> statement-breakpoint
CREATE TABLE "desglose" (
	"raid_id" uuid NOT NULL,
	"jugador_id" integer NOT NULL,
	"tipo" "tipo_desglose" NOT NULL,
	"orden" integer NOT NULL,
	"habilidad" text NOT NULL,
	"valor" double precision,
	"pct" double precision,
	"golpes" integer,
	"extra" jsonb,
	CONSTRAINT "desglose_raid_id_jugador_id_tipo_orden_pk" PRIMARY KEY("raid_id","jugador_id","tipo","orden")
);
--> statement-breakpoint
CREATE TABLE "dps_intento" (
	"raid_id" uuid NOT NULL,
	"jugador_id" integer NOT NULL,
	"intento" integer NOT NULL,
	"dps" integer NOT NULL,
	"muertes" integer NOT NULL,
	CONSTRAINT "dps_intento_raid_id_jugador_id_intento_pk" PRIMARY KEY("raid_id","jugador_id","intento")
);
--> statement-breakpoint
CREATE TABLE "intentos" (
	"raid_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"duracion_s" integer NOT NULL,
	"progreso_pct" double precision NOT NULL,
	"matado" boolean NOT NULL,
	"dps_grupo" integer,
	"muertes" integer,
	"rotura_s" integer,
	"ultima_causa" text,
	CONSTRAINT "intentos_raid_id_n_pk" PRIMARY KEY("raid_id","n")
);
--> statement-breakpoint
CREATE TABLE "jugadores" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"servidor" integer,
	"slug" text NOT NULL,
	"clase_id" text,
	"oculto" boolean DEFAULT false NOT NULL,
	"usuario_id" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jugadores_slug_unique" UNIQUE("slug"),
	CONSTRAINT "jugadores_nombre_servidor" UNIQUE NULLS NOT DISTINCT("nombre","servidor")
);
--> statement-breakpoint
CREATE TABLE "mitigacion" (
	"raid_id" uuid NOT NULL,
	"jugador_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"n" integer NOT NULL,
	"evitado" boolean NOT NULL,
	CONSTRAINT "mitigacion_raid_id_jugador_id_tipo_evitado_pk" PRIMARY KEY("raid_id","jugador_id","tipo","evitado")
);
--> statement-breakpoint
CREATE TABLE "muertes" (
	"raid_id" uuid NOT NULL,
	"jugador_id" integer NOT NULL,
	"intento" integer NOT NULL,
	"orden" integer NOT NULL,
	"t" integer NOT NULL,
	"habilidad" text,
	"origen" text,
	"golpe_max" bigint,
	"vida_5s" integer,
	"vida_1s" integer,
	"dano_5s" bigint,
	"cura_5s" bigint,
	CONSTRAINT "muertes_raid_id_jugador_id_intento_orden_pk" PRIMARY KEY("raid_id","jugador_id","intento","orden")
);
--> statement-breakpoint
CREATE TABLE "raid_jugador" (
	"raid_id" uuid NOT NULL,
	"jugador_id" integer NOT NULL,
	"en_grupo" boolean DEFAULT true NOT NULL,
	"clase_id" text,
	"gs" integer,
	"cp" integer,
	"dps" integer,
	"hps" integer,
	"dano_recibido" bigint,
	"muertes" integer,
	"crit_pct" double precision,
	"espalda_pct" double precision,
	"curacion" bigint,
	"escudos" bigint,
	"absorbido" bigint,
	"golpes_recibidos" integer,
	"cura_recibida" bigint,
	"escudo_recibido" bigint,
	"resurrecciones" integer,
	"bajo30_pct" double precision,
	"casteos" integer,
	"interrumpidos" integer,
	"vivo_s" integer,
	"casteos_min" double precision,
	"pausas_pct" double precision,
	"primer_golpe_s" double precision,
	CONSTRAINT "raid_jugador_raid_id_jugador_id_pk" PRIMARY KEY("raid_id","jugador_id")
);
--> statement-breakpoint
CREATE TABLE "raid_otros" (
	"raid_id" uuid NOT NULL,
	"npc" integer NOT NULL,
	"jefe" text,
	"intentos" integer,
	"matado" boolean NOT NULL,
	"kill_s" integer,
	"dps_raid" integer,
	CONSTRAINT "raid_otros_raid_id_npc_pk" PRIMARY KEY("raid_id","npc")
);
--> statement-breakpoint
CREATE TABLE "raids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"run_id" text,
	"huella" text,
	"fecha" timestamp with time zone NOT NULL,
	"mazmorra" integer,
	"npc_jefe" integer NOT NULL,
	"jefe" text,
	"visibilidad" "visibilidad" DEFAULT 'privada' NOT NULL,
	"intentos" integer NOT NULL,
	"matado" boolean NOT NULL,
	"kill_s" integer,
	"minutos_combate" double precision,
	"mejor_pct" double precision,
	"mejor_intento" integer,
	"muertes_grupo" integer,
	"dps_grupo_medio" integer,
	"hp_jefe" bigint,
	"run_min" double precision,
	"limite_min" integer,
	"reseteos" integer,
	"grabado_por" text,
	"subido_por" text,
	"origen" "origen_raid" NOT NULL,
	"esquema_version" integer NOT NULL,
	"sql_version" text,
	"extraido" timestamp with time zone,
	"publicado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raids_grupo_slug" UNIQUE("grupo_id","slug")
);
--> statement-breakpoint
CREATE TABLE "reparto_cura" (
	"raid_id" uuid NOT NULL,
	"jugador_id" integer NOT NULL,
	"objetivo_id" integer NOT NULL,
	"cantidad" bigint NOT NULL,
	"pct" double precision,
	CONSTRAINT "reparto_cura_raid_id_jugador_id_objetivo_id_pk" PRIMARY KEY("raid_id","jugador_id","objetivo_id")
);
--> statement-breakpoint
CREATE TABLE "analisis" (
	"raid_id" uuid NOT NULL,
	"idioma" "idioma" NOT NULL,
	"contenido" jsonb NOT NULL,
	"autor" text DEFAULT 'claude' NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analisis_raid_id_idioma_pk" PRIMARY KEY("raid_id","idioma")
);
--> statement-breakpoint
CREATE TABLE "apodos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "tipo_nombre" NOT NULL,
	"ref_id" bigint NOT NULL,
	"idioma" "idioma" NOT NULL,
	"apodo" text NOT NULL,
	"grupo_id" uuid
);
--> statement-breakpoint
CREATE TABLE "archivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo_id" uuid NOT NULL,
	"raid_id" uuid,
	"run_id" text,
	"encuentro_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"subido" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"grupo_id" uuid,
	"usuario_id" text,
	"accion" text NOT NULL,
	"ref" text,
	"detalle" jsonb,
	"creada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nombres" (
	"tipo" "tipo_nombre" NOT NULL,
	"id" bigint NOT NULL,
	"idioma" "idioma" NOT NULL,
	"nombre" text NOT NULL,
	"icono" text,
	CONSTRAINT "nombres_tipo_id_idioma_pk" PRIMARY KEY("tipo","id","idioma")
);
--> statement-breakpoint
CREATE TABLE "perfil_texto" (
	"id" serial PRIMARY KEY NOT NULL,
	"jugador_id" integer NOT NULL,
	"grupo_id" uuid,
	"idioma" "idioma" NOT NULL,
	"contenido" jsonb NOT NULL,
	"raids" integer,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitudes" (
	"id" serial PRIMARY KEY NOT NULL,
	"jugador_id" integer NOT NULL,
	"grupo_id" uuid,
	"usuario_id" text,
	"creada" timestamp with time zone DEFAULT now() NOT NULL,
	"avisada" text
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_creada_por_user_id_fk" FOREIGN KEY ("creada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembros" ADD CONSTRAINT "miembros_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembros" ADD CONSTRAINT "miembros_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_api" ADD CONSTRAINT "tokens_api_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_api" ADD CONSTRAINT "tokens_api_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "casteos_jefe" ADD CONSTRAINT "casteos_jefe_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curva" ADD CONSTRAINT "curva_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desglose" ADD CONSTRAINT "desglose_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desglose" ADD CONSTRAINT "desglose_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dps_intento" ADD CONSTRAINT "dps_intento_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dps_intento" ADD CONSTRAINT "dps_intento_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intentos" ADD CONSTRAINT "intentos_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jugadores" ADD CONSTRAINT "jugadores_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitigacion" ADD CONSTRAINT "mitigacion_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitigacion" ADD CONSTRAINT "mitigacion_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muertes" ADD CONSTRAINT "muertes_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muertes" ADD CONSTRAINT "muertes_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_jugador" ADD CONSTRAINT "raid_jugador_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_jugador" ADD CONSTRAINT "raid_jugador_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_otros" ADD CONSTRAINT "raid_otros_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raids" ADD CONSTRAINT "raids_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raids" ADD CONSTRAINT "raids_subido_por_user_id_fk" FOREIGN KEY ("subido_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto_cura" ADD CONSTRAINT "reparto_cura_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto_cura" ADD CONSTRAINT "reparto_cura_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto_cura" ADD CONSTRAINT "reparto_cura_objetivo_id_jugadores_id_fk" FOREIGN KEY ("objetivo_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analisis" ADD CONSTRAINT "analisis_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apodos" ADD CONSTRAINT "apodos_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_texto" ADD CONSTRAINT "perfil_texto_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_texto" ADD CONSTRAINT "perfil_texto_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "invitaciones_grupo_idx" ON "invitaciones" USING btree ("grupo_id");--> statement-breakpoint
CREATE INDEX "miembros_usuario_idx" ON "miembros" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "tokens_grupo_idx" ON "tokens_api" USING btree ("grupo_id");--> statement-breakpoint
CREATE INDEX "muertes_jugador_idx" ON "muertes" USING btree ("jugador_id");--> statement-breakpoint
CREATE INDEX "raid_jugador_jugador_idx" ON "raid_jugador" USING btree ("jugador_id");--> statement-breakpoint
CREATE INDEX "raids_grupo_fecha_idx" ON "raids" USING btree ("grupo_id","fecha" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "raids_huella_idx" ON "raids" USING btree ("huella");--> statement-breakpoint
CREATE INDEX "apodos_ref_idx" ON "apodos" USING btree ("tipo","ref_id","idioma");--> statement-breakpoint
CREATE INDEX "archivos_grupo_idx" ON "archivos" USING btree ("grupo_id");--> statement-breakpoint
CREATE INDEX "auditoria_grupo_idx" ON "auditoria" USING btree ("grupo_id","creada");--> statement-breakpoint
CREATE INDEX "perfil_texto_jugador_idx" ON "perfil_texto" USING btree ("jugador_id","idioma");--> statement-breakpoint
CREATE INDEX "solicitudes_jugador_idx" ON "solicitudes" USING btree ("jugador_id","creada");