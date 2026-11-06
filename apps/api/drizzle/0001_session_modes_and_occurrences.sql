CREATE TABLE "mistake_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mistake_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"severity" varchar(16) NOT NULL,
	"self_corrected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mistake_occurrences" ADD CONSTRAINT "mistake_occurrences_mistake_id_mistakes_id_fk" FOREIGN KEY ("mistake_id") REFERENCES "public"."mistakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistake_occurrences" ADD CONSTRAINT "mistake_occurrences_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "scenario";