ALTER TABLE "sessions" ADD COLUMN "track_stage" varchar(16);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "track_goal" varchar(32);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "track_tries" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "track_helped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "track_unaided_streak" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "track_stuck_streak" smallint DEFAULT 0 NOT NULL;