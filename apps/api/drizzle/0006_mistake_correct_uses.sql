CREATE TABLE "mistake_correct_uses" (
	"mistake_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"language" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mistake_correct_uses_mistake_id_session_id_pk" PRIMARY KEY("mistake_id","session_id")
);
--> statement-breakpoint
ALTER TABLE "mistake_correct_uses" ADD CONSTRAINT "mistake_correct_uses_mistake_id_mistakes_id_fk" FOREIGN KEY ("mistake_id") REFERENCES "public"."mistakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistake_correct_uses" ADD CONSTRAINT "mistake_correct_uses_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;