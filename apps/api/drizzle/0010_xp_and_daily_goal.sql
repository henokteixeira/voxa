CREATE TABLE "daily_goal_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" varchar(16) NOT NULL,
	"seq" bigserial NOT NULL,
	"minutes_per_day" smallint NOT NULL,
	"set_at" timestamp with time zone NOT NULL,
	CONSTRAINT "daily_goal_settings_minutes" CHECK ("daily_goal_settings"."minutes_per_day" in (15, 30, 45, 60))
);
--> statement-breakpoint
CREATE TABLE "session_xp" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"language" varchar(16) NOT NULL,
	"total" integer NOT NULL,
	"words_per_minute" integer,
	"awarded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_awards" (
	"session_id" uuid NOT NULL,
	"reason" varchar(32) NOT NULL,
	"count" integer NOT NULL,
	"points" integer NOT NULL,
	CONSTRAINT "xp_awards_session_id_reason_pk" PRIMARY KEY("session_id","reason"),
	CONSTRAINT "xp_awards_reason" CHECK ("xp_awards"."reason" in ('practice_minute', 'goal_covered', 'self_corrected', 'personal_record'))
);
--> statement-breakpoint
ALTER TABLE "session_xp" ADD CONSTRAINT "session_xp_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_awards" ADD CONSTRAINT "xp_awards_session_id_session_xp_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session_xp"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_xp_language_awarded_at" ON "session_xp" USING btree ("language","awarded_at");