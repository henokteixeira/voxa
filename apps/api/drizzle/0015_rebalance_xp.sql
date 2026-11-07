-- XP rebalanced on 2026-11-07: the daily goal follows the practice time, bonuses are small
-- (goal covered 1, self-correction 2, record 3) and placement tasks earn no goal XP.
-- Recomputes the XP already awarded with the new points, so past days and streaks stay consistent.
DELETE FROM "xp_awards" a USING "sessions" s
  WHERE a."session_id" = s."id" AND s."mode" = 'placement' AND a."reason" = 'goal_covered';
--> statement-breakpoint
UPDATE "xp_awards" SET "points" = "count" * CASE "reason"
  WHEN 'practice_minute' THEN 1
  WHEN 'goal_covered' THEN 1
  WHEN 'self_corrected' THEN 2
  WHEN 'personal_record' THEN 3
END;
--> statement-breakpoint
UPDATE "session_xp" x SET "total" = coalesce((SELECT sum(a."points") FROM "xp_awards" a WHERE a."session_id" = x."session_id"), 0);
