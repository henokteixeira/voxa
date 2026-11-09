ALTER TABLE "missions" ADD COLUMN "listened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "expressions_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "review_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "mission_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE set null ON UPDATE no action;