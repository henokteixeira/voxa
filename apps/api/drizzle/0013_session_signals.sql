CREATE TABLE "session_signals" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"language" varchar(16) NOT NULL,
	"mode" varchar(32) NOT NULL,
	"seq" bigserial NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"unaided_share" double precision,
	"words_per_minute" integer,
	"long_pauses_per_minute" double precision,
	"average_pause_ms" integer,
	"mistakes_per_100_words" double precision,
	"self_correction_rate" double precision
);
--> statement-breakpoint
ALTER TABLE "session_signals" ADD CONSTRAINT "session_signals_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_signals_language_seq" ON "session_signals" USING btree ("language","seq");