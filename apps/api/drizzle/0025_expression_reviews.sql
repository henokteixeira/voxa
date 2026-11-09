ALTER TABLE "review_items" DROP CONSTRAINT "review_items_one_subject";--> statement-breakpoint
ALTER TABLE "mission_expressions" ADD COLUMN "said_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_items" ADD COLUMN "expression_id" uuid;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_expression_id_mission_expressions_id_fk" FOREIGN KEY ("expression_id") REFERENCES "public"."mission_expressions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_expression_id_unique" UNIQUE("expression_id");--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_one_subject" CHECK (num_nonnulls("review_items"."pattern_id", "review_items"."new_word_id", "review_items"."expression_id") = 1);