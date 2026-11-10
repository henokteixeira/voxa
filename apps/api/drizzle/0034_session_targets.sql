CREATE TABLE "session_targets" (
	"session_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"language" varchar(16) NOT NULL,
	"original" text NOT NULL,
	"correction" text NOT NULL,
	"category" varchar(32) NOT NULL,
	"met" boolean DEFAULT false NOT NULL,
	CONSTRAINT "session_targets_session_id_position_pk" PRIMARY KEY("session_id","position"),
	CONSTRAINT "session_targets_session_original" UNIQUE("session_id","original")
);
--> statement-breakpoint
ALTER TABLE "session_targets" ADD CONSTRAINT "session_targets_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Moves each session's targets out of the jsonb columns, keeping their order and which were met.
INSERT INTO "session_targets" ("session_id", "position", "language", "original", "correction", "category", "met")
SELECT s."id", t."position" - 1, s."language", t."target"->>'original', t."target"->>'correction', t."target"->>'category',
  s."met_targets" ? (t."target"->>'original')
FROM "sessions" s, jsonb_array_elements(s."targets") WITH ORDINALITY AS t("target", "position")
WHERE t."target"->>'original' IS NOT NULL AND t."target"->>'correction' IS NOT NULL AND t."target"->>'category' IS NOT NULL
ORDER BY s."id", t."position"
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "targets";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "met_targets";