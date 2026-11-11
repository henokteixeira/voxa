CREATE TABLE "learners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Until login exists there is one learner: every record saved so far is theirs.
INSERT INTO "learners" DEFAULT VALUES;--> statement-breakpoint
ALTER TABLE "missions" DROP CONSTRAINT "missions_language_day";--> statement-breakpoint
ALTER TABLE "mistakes" DROP CONSTRAINT "mistakes_language_original";--> statement-breakpoint
ALTER TABLE "review_items" DROP CONSTRAINT "review_items_pattern_id_unique";--> statement-breakpoint
DROP INDEX "check_ins_language_seq";--> statement-breakpoint
DROP INDEX "learner_facts_seq";--> statement-breakpoint
DROP INDEX "review_items_due";--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "learner_id" uuid;--> statement-breakpoint
UPDATE "check_ins" SET "learner_id" = (SELECT "id" FROM "learners");--> statement-breakpoint
ALTER TABLE "check_ins" ALTER COLUMN "learner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_goal_settings" ADD COLUMN "learner_id" uuid;--> statement-breakpoint
UPDATE "daily_goal_settings" SET "learner_id" = (SELECT "id" FROM "learners");--> statement-breakpoint
ALTER TABLE "daily_goal_settings" ALTER COLUMN "learner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "learner_facts" ADD COLUMN "learner_id" uuid;--> statement-breakpoint
UPDATE "learner_facts" SET "learner_id" = (SELECT "id" FROM "learners");--> statement-breakpoint
ALTER TABLE "learner_facts" ALTER COLUMN "learner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "learner_id" uuid;--> statement-breakpoint
UPDATE "missions" SET "learner_id" = (SELECT "id" FROM "learners");--> statement-breakpoint
ALTER TABLE "missions" ALTER COLUMN "learner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mistakes" ADD COLUMN "learner_id" uuid;--> statement-breakpoint
UPDATE "mistakes" SET "learner_id" = (SELECT "id" FROM "learners");--> statement-breakpoint
ALTER TABLE "mistakes" ALTER COLUMN "learner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review_items" ADD COLUMN "learner_id" uuid;--> statement-breakpoint
UPDATE "review_items" SET "learner_id" = (SELECT "id" FROM "learners");--> statement-breakpoint
ALTER TABLE "review_items" ALTER COLUMN "learner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "learner_id" uuid;--> statement-breakpoint
UPDATE "sessions" SET "learner_id" = (SELECT "id" FROM "learners");--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "learner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "speaking_levels" ADD COLUMN "learner_id" uuid;--> statement-breakpoint
UPDATE "speaking_levels" SET "learner_id" = (SELECT "id" FROM "learners");--> statement-breakpoint
ALTER TABLE "speaking_levels" ALTER COLUMN "learner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_goal_settings" ADD CONSTRAINT "daily_goal_settings_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_facts" ADD CONSTRAINT "learner_facts_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_levels" ADD CONSTRAINT "speaking_levels_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_ins_learner_language_seq" ON "check_ins" USING btree ("learner_id","language","seq");--> statement-breakpoint
CREATE INDEX "daily_goal_settings_learner_language_seq" ON "daily_goal_settings" USING btree ("learner_id","language","seq");--> statement-breakpoint
CREATE INDEX "learner_facts_learner_seq" ON "learner_facts" USING btree ("learner_id","seq");--> statement-breakpoint
CREATE INDEX "sessions_learner_started_at" ON "sessions" USING btree ("learner_id","started_at");--> statement-breakpoint
CREATE INDEX "speaking_levels_learner_language_seq" ON "speaking_levels" USING btree ("learner_id","language","seq");--> statement-breakpoint
CREATE INDEX "review_items_due" ON "review_items" USING btree ("learner_id","language","due_at");--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_learner_language_day" UNIQUE("learner_id","language","day");--> statement-breakpoint
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_learner_language_original" UNIQUE("learner_id","language","original");--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_learner_pattern" UNIQUE("learner_id","pattern_id");