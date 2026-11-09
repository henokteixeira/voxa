import { useId } from "react";
import { Card } from "@/components/ui/card";
import type { TodayProgress } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { GoalRing } from "./goal-ring";
import { XP_COPY } from "./xp-copy";

/** Today's goal in one line: a small ring, what is left, and the streak. Quiet: never a threat. */
export function TodayGoalCard({ today }: { today: TodayProgress }) {
  const copy = useCopy(XP_COPY);
  const titleId = useId();
  const { earnedXp, goalXp, goalMet, streakDays } = today;
  return (
    <Card role="region" aria-labelledby={titleId} className="flex-row items-center gap-3 px-4 py-2.5">
      <h2 id={titleId} className="sr-only">
        {copy.todayGoal}
      </h2>
      <GoalRing value={earnedXp} goal={goalXp} size={40} label={copy.ringLabel(earnedXp, goalXp)} />
      <span className="min-w-0 flex-1 text-small font-bold">{goalMet ? copy.goalMet : copy.toGo(goalXp - earnedXp)}</span>
      {streakDays > 0 && (
        <span className="shrink-0 text-caption text-honey-ink">
          <span aria-hidden="true">{copy.streakShort(streakDays)}</span>
          <span className="sr-only">{copy.streak(streakDays)}</span>
        </span>
      )}
    </Card>
  );
}
