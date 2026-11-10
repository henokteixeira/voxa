CREATE INDEX "mistake_occurrences_mistake_id" ON "mistake_occurrences" USING btree ("mistake_id");--> statement-breakpoint
CREATE INDEX "mistake_occurrences_session_id" ON "mistake_occurrences" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_mission_id" ON "sessions" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "turns_session_id_seq" ON "turns" USING btree ("session_id","seq");--> statement-breakpoint
ALTER TABLE "mistake_occurrences" ADD CONSTRAINT "mistake_occurrences_severity" CHECK ("mistake_occurrences"."severity" in ('serious', 'minor'));--> statement-breakpoint
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_dismiss_reason" CHECK ("mistakes"."dismiss_reason" in ('transcript_error', 'both_correct', 'not_needed'));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_mode" CHECK ("sessions"."mode" in ('free_talk', 'my_day', 'story', 'opinion', 'presentation', 'daily', 'review', 'placement'));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_support_step" CHECK ("sessions"."support_step" in ('build_full', 'build_light', 'supported', 'conversation', 'demanding'));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_track_stage" CHECK ("sessions"."track_stage" in ('model', 'swap', 'extend', 'answer', 'again'));--> statement-breakpoint
ALTER TABLE "speaking_levels" ADD CONSTRAINT "speaking_levels_level" CHECK ("speaking_levels"."level" in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));--> statement-breakpoint
ALTER TABLE "speaking_levels" ADD CONSTRAINT "speaking_levels_source" CHECK ("speaking_levels"."source" in ('placement', 'manual', 'step_change'));--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_role" CHECK ("turns"."role" in ('user', 'assistant'));