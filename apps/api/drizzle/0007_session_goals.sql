ALTER TABLE "sessions" ADD COLUMN "covered_goals" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_check_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "targets" jsonb DEFAULT '[]'::jsonb NOT NULL;