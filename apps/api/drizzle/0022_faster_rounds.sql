CREATE TABLE "faster_rounds" (
	"session_id" uuid NOT NULL,
	"round" smallint NOT NULL,
	"language" varchar(16) NOT NULL,
	"time_limit_ms" integer NOT NULL,
	"transcript" text NOT NULL,
	"spoken_words" integer NOT NULL,
	"speech_ms" integer NOT NULL,
	"long_pauses" smallint NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "faster_rounds_session_id_round_pk" PRIMARY KEY("session_id","round"),
	CONSTRAINT "faster_rounds_round" CHECK ("faster_rounds"."round" between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "faster_rounds" ADD CONSTRAINT "faster_rounds_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;