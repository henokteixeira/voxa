CREATE TABLE "speaking_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" varchar(16) NOT NULL,
	"seq" bigserial NOT NULL,
	"level" varchar(2) NOT NULL,
	"source" varchar(16) NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assessed_at" timestamp with time zone NOT NULL
);
