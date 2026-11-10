CREATE TABLE "model_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" varchar(32) NOT NULL,
	"model" varchar(64) NOT NULL,
	"effort" varchar(8) NOT NULL,
	"input_tokens" integer NOT NULL,
	"cache_read_tokens" integer NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"failed" boolean NOT NULL,
	"called_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_turn_timings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"stt_ms" integer,
	"tutor_ms" integer NOT NULL,
	"tts_ms" integer NOT NULL,
	"total_ms" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_turn_timings" ADD CONSTRAINT "voice_turn_timings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_calls_task_called_at" ON "model_calls" USING btree ("task","called_at");--> statement-breakpoint
CREATE INDEX "voice_turn_timings_recorded_at" ON "voice_turn_timings" USING btree ("recorded_at");