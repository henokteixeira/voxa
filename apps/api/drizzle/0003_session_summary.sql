ALTER TABLE "sessions" ADD COLUMN "timing" jsonb;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "confidence_before" smallint;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "confidence_after" smallint;