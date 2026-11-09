CREATE TABLE "check_in_recordings" (
	"check_in_id" uuid PRIMARY KEY NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"audio" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"language" varchar(16) NOT NULL,
	"task" varchar(32) NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"transcript" text NOT NULL,
	"spoken_words" integer NOT NULL,
	"speech_ms" integer NOT NULL,
	"long_pauses" smallint NOT NULL,
	CONSTRAINT "check_ins_task" CHECK ("check_ins"."task" in ('present_project'))
);
--> statement-breakpoint
ALTER TABLE "check_in_recordings" ADD CONSTRAINT "check_in_recordings_check_in_id_check_ins_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."check_ins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_ins_language_seq" ON "check_ins" USING btree ("language","seq");