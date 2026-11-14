ALTER TABLE "sessions" DROP CONSTRAINT "sessions_track_stage";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "key_words" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "track_support" varchar(16);--> statement-breakpoint
-- The earlier guided track's stages have no place in the step-by-step script: an open session goes on without it.
UPDATE "sessions" SET "track_stage" = NULL, "track_goal" = NULL, "track_tries" = 0, "track_unaided_streak" = 0 WHERE "track_stage" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "track_helped";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "track_stuck_streak";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_track_support" CHECK ("sessions"."track_support" in ('example', 'frame', 'start', 'alone'));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_track_complete" CHECK (("sessions"."track_stage" is null) = ("sessions"."track_support" is null));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_track_stage" CHECK ("sessions"."track_stage" in ('answer', 'retell'));