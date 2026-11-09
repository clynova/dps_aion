CREATE TABLE "mecanicas" (
	"raid_id" uuid NOT NULL,
	"jugador_id" integer NOT NULL,
	"habilidad" text NOT NULL,
	"orden" integer NOT NULL,
	"orden_jugador" integer NOT NULL,
	"golpes_hab" integer NOT NULL,
	"olas_hab" integer NOT NULL,
	"alcance" double precision NOT NULL,
	"golpes" integer NOT NULL,
	"olas" integer NOT NULL,
	"expuesto" integer NOT NULL,
	"dano" bigint NOT NULL,
	"golpe_max" bigint NOT NULL,
	CONSTRAINT "mecanicas_raid_id_habilidad_jugador_id_pk" PRIMARY KEY("raid_id","habilidad","jugador_id")
);
--> statement-breakpoint
ALTER TABLE "grupos" ADD COLUMN "aviso_raids" text;--> statement-breakpoint
ALTER TABLE "mecanicas" ADD CONSTRAINT "mecanicas_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mecanicas" ADD CONSTRAINT "mecanicas_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mecanicas_jugador_idx" ON "mecanicas" USING btree ("jugador_id");