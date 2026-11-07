ALTER TABLE "sessions" ADD COLUMN "support_step" varchar(16);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "scaffold" text;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "assisted" boolean DEFAULT false NOT NULL;