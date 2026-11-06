ALTER TABLE "mistakes" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mistakes" ADD COLUMN "dismiss_reason" varchar(32);