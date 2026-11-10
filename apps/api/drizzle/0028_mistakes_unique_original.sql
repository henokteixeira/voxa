-- One row per mistake and language. Rows saved twice by two turns at once are merged first:
-- the kept row is the dismissed one if any (the learner's choice stands), else the latest seen.
CREATE TEMP TABLE "mistake_merge" ON COMMIT DROP AS
SELECT "id", "keep" FROM (
  SELECT "id", first_value("id") OVER (
    PARTITION BY "language", "original" ORDER BY "dismissed_at" NULLS LAST, "last_seen_at" DESC, "id"
  ) AS "keep"
  FROM "mistakes"
) AS "ranked"
WHERE "id" <> "keep";--> statement-breakpoint
UPDATE "mistakes" AS "k"
SET "occurrences" = "k"."occurrences" + "s"."occurrences",
    "last_seen_at" = greatest("k"."last_seen_at", "s"."last_seen_at"),
    "pattern_id" = coalesce("k"."pattern_id", "s"."pattern_id")
FROM (
  SELECT "m"."keep", sum("d"."occurrences") AS "occurrences", max("d"."last_seen_at") AS "last_seen_at",
         (array_agg("d"."pattern_id") FILTER (WHERE "d"."pattern_id" IS NOT NULL))[1] AS "pattern_id"
  FROM "mistake_merge" AS "m" JOIN "mistakes" AS "d" ON "d"."id" = "m"."id"
  GROUP BY "m"."keep"
) AS "s"
WHERE "k"."id" = "s"."keep";--> statement-breakpoint
UPDATE "mistake_occurrences" AS "o" SET "mistake_id" = "m"."keep"
FROM "mistake_merge" AS "m" WHERE "o"."mistake_id" = "m"."id";--> statement-breakpoint
INSERT INTO "mistake_correct_uses" ("mistake_id", "session_id", "language", "created_at")
SELECT "m"."keep", "u"."session_id", "u"."language", "u"."created_at"
FROM "mistake_correct_uses" AS "u" JOIN "mistake_merge" AS "m" ON "u"."mistake_id" = "m"."id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- A new word keeps one review schedule: the kept row's, else the soonest due of the merged rows.
UPDATE "review_items" AS "r" SET "new_word_id" = "m"."keep"
FROM "mistake_merge" AS "m"
WHERE "r"."new_word_id" = "m"."id"
  AND "r"."id" IN (
    SELECT DISTINCT ON ("m2"."keep") "r2"."id"
    FROM "review_items" AS "r2" JOIN "mistake_merge" AS "m2" ON "r2"."new_word_id" = "m2"."id"
    WHERE NOT EXISTS (SELECT 1 FROM "review_items" AS "k" WHERE "k"."new_word_id" = "m2"."keep")
    ORDER BY "m2"."keep", "r2"."due_at", "r2"."id"
  );--> statement-breakpoint
-- What is left of the merged rows (their correct uses and review items) goes with them.
DELETE FROM "mistakes" WHERE "id" IN (SELECT "id" FROM "mistake_merge");--> statement-breakpoint
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_language_original" UNIQUE("language","original");
