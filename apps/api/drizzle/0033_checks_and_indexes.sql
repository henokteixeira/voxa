-- NOT VALID: the checks hold for every new or changed row; rows saved by older versions are not re-read,
-- so one unexpected old value cannot stop the API from starting.
CREATE INDEX "mistake_occurrences_mistake_id" ON "mistake_occurrences" USING btree ("mistake_id");--> statement-breakpoint
CREATE INDEX "mistake_occurrences_session_id" ON "mistake_occurrences" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_mission_id" ON "sessions" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "turns_session_id_seq" ON "turns" USING btree ("session_id","seq");--> statement-breakpoint
ALTER TABLE "mistake_occurrences" ADD CONSTRAINT "mistake_occurrences_severity" CHECK ("mistake_occurrences"."severity" in ('serious', 'minor')) NOT VALID;--> statement-breakpoint
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_dismiss_reason" CHECK ("mistakes"."dismiss_reason" in ('transcript_error', 'both_correct', 'not_needed')) NOT VALID;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_mode" CHECK ("sessions"."mode" in ('free_talk', 'my_day', 'story', 'opinion', 'presentation', 'daily', 'review', 'placement')) NOT VALID;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_support_step" CHECK ("sessions"."support_step" in ('build_full', 'build_light', 'supported', 'conversation', 'demanding')) NOT VALID;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_track_stage" CHECK ("sessions"."track_stage" in ('model', 'swap', 'extend', 'answer', 'again')) NOT VALID;--> statement-breakpoint
ALTER TABLE "speaking_levels" ADD CONSTRAINT "speaking_levels_level" CHECK ("speaking_levels"."level" in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')) NOT VALID;--> statement-breakpoint
ALTER TABLE "speaking_levels" ADD CONSTRAINT "speaking_levels_source" CHECK ("speaking_levels"."source" in ('placement', 'manual', 'step_change')) NOT VALID;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_role" CHECK ("turns"."role" in ('user', 'assistant')) NOT VALID;
