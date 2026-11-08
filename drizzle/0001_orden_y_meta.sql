ALTER TABLE "raid_jugador" ADD COLUMN "orden" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "raid_otros" ADD COLUMN "orden" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "raids" ADD COLUMN "meta" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reparto_cura" ADD COLUMN "orden" integer NOT NULL;