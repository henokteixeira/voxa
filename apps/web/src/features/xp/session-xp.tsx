import { useEffect, useId, useRef, useState } from "react";
import type { SessionXp } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { useSounds } from "@/lib/sound/sounds";
import { GoalRing } from "./goal-ring";
import { closedTheGoal } from "./today-goal";
import { useTodayProgress } from "./use-today-progress";
import { XP_COPY } from "./xp-copy";

/** How long the session's XP takes to count up. */
const COUNT_MS = 900;

/** No count-up with reduced motion, or where media queries can't be read (then nothing animates). */
const reducedMotion = () =>
  typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts from 0 to `total` once; shows `total` at once with reduced motion. */
function useCountUp(total: number) {
  const [value, setValue] = useState(() => (reducedMotion() ? total : 0));
  useEffect(() => {
    if (reducedMotion()) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const share = Math.min(1, (now - start) / COUNT_MS);
      setValue(Math.round(total * (1 - (1 - share) ** 3)));
      if (share < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [total]);
  return value;
}

/** The session's XP on its summary: counted up, by reason, then today's ring (closing it, if this session did). */
export function SessionXpCard({ xp }: { xp: SessionXp }) {
  const copy = useCopy(XP_COPY);
  const { play } = useSounds();
  const { today } = useTodayProgress();
  const titleId = useId();
  const value = useCountUp(xp.total);
  const counted = value === xp.total;
  const record = xp.awards.some((a) => a.reason === "personal_record");
  const closed = today ? closedTheGoal(today, xp.total) : false;

  // Once the count ends and today is known: one sound, the biggest moment wins.
  const played = useRef(false);
  useEffect(() => {
    if (!counted || today === undefined || played.current) return;
    played.current = true;
    if (xp.total === 0) return;
    play(closed ? "dailyGoal" : record ? "record" : "xp");
  }, [counted, today, closed, record, xp.total, play]);

  return (
    <section aria-labelledby={titleId} className="flex items-center gap-4 rounded-lg bg-paper px-5 py-4 shadow-card">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id={titleId} className="m-0 text-label text-taupe">
          {copy.sessionXp}
        </h2>
        <span className="font-serif text-[32px] leading-none text-sage-ink tabular-nums" aria-hidden="true">
          +{value}
        </span>
        <span className="sr-only">+{xp.total} XP</span>
        {xp.awards.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-caption text-taupe">
            {xp.awards.map((award) => (
              <li key={award.reason} className="flex justify-between gap-3">
                <span>{copy.award[award.reason](award.count)}</span>
                <span className="tabular-nums">+{award.points}</span>
              </li>
            ))}
          </ul>
        )}
        {counted && (closed || record) && (
          <span role="status" className="text-caption font-bold text-honey-ink">
            {closed ? copy.dailyGoalMet : copy.newRecord}
          </span>
        )}
      </div>
      {/* Today's ring comes once the session's XP is counted, so it fills with this session in it. */}
      {counted && today && (
        <GoalRing value={today.earnedXp} goal={today.goalXp} size={84} label={copy.ringLabel(today.earnedXp, today.goalXp)} />
      )}
    </section>
  );
}
