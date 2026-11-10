ALTER TABLE "sessions" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing sessions: their last turn, or when they started.
UPDATE "sessions" SET "last_active_at" = coalesce((SELECT max("created_at") FROM "turns" WHERE "turns"."session_id" = "sessions"."id"), "sessions"."started_at");--> statement-breakpoint
CREATE INDEX "sessions_open_last_active_at" ON "sessions" USING btree ("last_active_at") WHERE "sessions"."ended_at" is null;
