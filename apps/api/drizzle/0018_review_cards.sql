CREATE TABLE "review_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" varchar(16) NOT NULL,
	"review_item_id" uuid NOT NULL,
	"cue" text NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"recalled" boolean
);
--> statement-breakpoint
ALTER TABLE "review_cards" ADD CONSTRAINT "review_cards_review_item_id_review_items_id_fk" FOREIGN KEY ("review_item_id") REFERENCES "public"."review_items"("id") ON DELETE cascade ON UPDATE no action;