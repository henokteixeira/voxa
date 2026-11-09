import { useId } from "react";
import type { TodayProgress } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { XP_COPY } from "./xp-copy";

/** Today's goal as a thin bar with the XP, and the streak. Quiet: never a threat. */
export function TodayGoalCard({ today }: { today: TodayProgress }) {
  const copy = useCopy(XP_COPY);
  const titleId = useId();
  const { earnedXp, goalXp, goalMet, streakDays } = today;
  const share = goalXp > 0 ? Math.min(1, earnedXp / goalXp) : 0;
  return (
    <section aria-labelledby={titleId} className="flex items-center gap-3 text-small font-bold text-taupe">
      <h2 id={titleId} className="sr-only">
        {copy.todayGoal}
      </h2>
      <span role="img" aria-label={copy.ringLabel(earnedXp, goalXp)} className="block h-1.5 flex-1 overflow-hidden rounded-pill bg-sand">
        <i className="block h-full rounded-pill bg-sage-strong" style={{ width: `${share * 100}%` }} />
      </span>
      <span aria-hidden="true" className="tabular-nums">
        {copy.xpOf(earnedXp, goalXp)}
      </span>
      {goalMet && <span className="sr-only">{copy.goalMet}</span>}
      {streakDays > 0 && (
        <span className="shrink-0 text-caption text-honey-ink">
          <span aria-hidden="true">{copy.streakShort(streakDays)}</span>
          <span className="sr-only">{copy.streak(streakDays)}</span>
        </span>
      )}
    </section>
  );
}
