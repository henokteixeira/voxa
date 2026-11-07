import { useId } from "react";
import { Card } from "@/components/ui/card";
import type { TodayProgress } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { GoalRing } from "./goal-ring";
import { XP_COPY } from "./xp-copy";

/** Today's goal ring and the streak. Quiet: small numbers, soft colours, never a threat. */
export function TodayGoalCard({ today }: { today: TodayProgress }) {
  const copy = useCopy(XP_COPY);
  const titleId = useId();
  const { earnedXp, goalXp, goalMet, streakDays } = today;
  return (
    <Card role="region" aria-labelledby={titleId} className="flex-row items-center gap-4">
      <GoalRing value={earnedXp} goal={goalXp} size={84} label={copy.ringLabel(earnedXp, goalXp)} />
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={titleId} className="m-0 text-label text-taupe">
          {copy.todayGoal}
        </h2>
        <span className="text-body-strong">{goalMet ? copy.goalMet : copy.toGo(goalXp - earnedXp)}</span>
        <span className={`text-caption ${streakDays > 0 ? "text-honey-ink" : "text-taupe"}`}>
          {streakDays > 0 ? copy.streak(streakDays) : copy.streakNone}
        </span>
      </div>
    </Card>
  );
}
