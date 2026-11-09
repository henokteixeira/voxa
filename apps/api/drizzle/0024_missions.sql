CREATE TABLE "mission_expressions" (
	"mission_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"phrase" text NOT NULL,
	"example" text NOT NULL,
	CONSTRAINT "mission_expressions_mission_id_position_pk" PRIMARY KEY("mission_id","position"),
	CONSTRAINT "mission_expressions_position" CHECK ("mission_expressions"."position" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" varchar(16) NOT NULL,
	"day" date NOT NULL,
	"situation" varchar(32) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"model_speaker" varchar(64),
	"model_text" text,
	CONSTRAINT "missions_language_day" UNIQUE("language","day"),
	CONSTRAINT "missions_situation" CHECK ("missions"."situation" in ('daily', 'my_day', 'presentation', 'story', 'review', 'opinion')),
	CONSTRAINT "missions_model" CHECK (("missions"."model_speaker" is null) = ("missions"."model_text" is null))
);
--> statement-breakpoint
ALTER TABLE "mission_expressions" ADD CONSTRAINT "mission_expressions_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;