CREATE TABLE "daily_goal_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" varchar(16) NOT NULL,
	"seq" bigserial NOT NULL,
	"minutes_per_day" smallint NOT NULL,
	"set_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_awards" (
	"session_id" uuid NOT NULL,
	"language" varchar(16) NOT NULL,
	"reason" varchar(32) NOT NULL,
	"count" integer NOT NULL,
	"points" integer NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "xp_awards_session_id_reason_pk" PRIMARY KEY("session_id","reason")
);
--> statement-breakpoint
ALTER TABLE "xp_awards" ADD CONSTRAINT "xp_awards_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "xp_awards_language_earned_at" ON "xp_awards" USING btree ("language","earned_at");