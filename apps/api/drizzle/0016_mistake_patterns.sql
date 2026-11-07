CREATE TABLE "patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" varchar(16) NOT NULL,
	"key" varchar(64) NOT NULL,
	"category" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"rule" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patterns_language_key" UNIQUE("language","key")
);
--> statement-breakpoint
ALTER TABLE "mistakes" ADD COLUMN "pattern_id" uuid;--> statement-breakpoint
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE set null ON UPDATE no action;