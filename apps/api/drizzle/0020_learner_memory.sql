CREATE TABLE "learner_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"topic" varchar(16) NOT NULL,
	"statement" text NOT NULL,
	"language" varchar(16) NOT NULL,
	"source_session_id" uuid,
	"learned_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "remembered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "recap" text;--> statement-breakpoint
ALTER TABLE "learner_facts" ADD CONSTRAINT "learner_facts_source_session_id_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learner_facts_seq" ON "learner_facts" USING btree ("seq");