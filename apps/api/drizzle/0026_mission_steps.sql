ALTER TABLE "missions" ADD COLUMN "listened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "expressions_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "review_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;