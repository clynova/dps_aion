CREATE TABLE "analisis_toxico" (
	"raid_id" uuid NOT NULL,
	"idioma" "idioma" NOT NULL,
	"contenido" jsonb NOT NULL,
	"autor" text DEFAULT 'deepseek' NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analisis_toxico_raid_id_idioma_pk" PRIMARY KEY("raid_id","idioma")
);
--> statement-breakpoint
ALTER TABLE "grupos" ADD COLUMN "toxico" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "analisis_toxico" ADD CONSTRAINT "analisis_toxico_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;