CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" varchar(16) NOT NULL,
	"pattern_id" uuid,
	"new_word_id" uuid,
	"step" smallint NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	CONSTRAINT "review_items_pattern_id_unique" UNIQUE("pattern_id"),
	CONSTRAINT "review_items_new_word_id_unique" UNIQUE("new_word_id"),
	CONSTRAINT "review_items_one_subject" CHECK (("review_items"."pattern_id" is null) <> ("review_items"."new_word_id" is null))
);
--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_new_word_id_mistakes_id_fk" FOREIGN KEY ("new_word_id") REFERENCES "public"."mistakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_items_due" ON "review_items" USING btree ("language","due_at");--> statement-breakpoint
-- New words saved before reviews existed are due now.
INSERT INTO "review_items" ("language", "new_word_id", "step", "due_at")
SELECT "language", "id", 0, now() FROM "mistakes" WHERE "category" = 'new_word' AND "dismissed_at" IS NULL;
