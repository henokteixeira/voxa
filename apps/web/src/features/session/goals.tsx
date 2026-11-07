import { Button } from "@/components/ui/button";
import type { SessionSummary } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { GOALS_COPY } from "./goals-copy";

/** The meeting's goals as chips; covered ones are ticked. Nothing in free talk. */
export function GoalsStrip({ goals, covered }: { goals: string[]; covered: string[] }) {
  const copy = useCopy(GOALS_COPY);
  if (!goals.length) return null;
  return (
    <ul aria-label={copy.goalsLabel} className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0">
      {goals.map((goal) => {
        const done = covered.includes(goal);
        return (
          <li
            key={goal}
            className={cn(
              "rounded-pill px-2.5 py-1 text-[12px] font-bold transition-colors duration-300",
              done ? "bg-sage-soft text-sage-ink" : "bg-sand-soft text-taupe",
            )}
          >
            {done ? "✓ " : ""}
            {copy.goal[goal] ?? goal}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The placement interview's parts as a bar that fills part by part (warm-up up to the harder tasks).
 * It never shows how well the learner did: a part the tutor skipped as too hard fills like any other.
 */
export function PartsBar({ parts, done }: { parts: string[]; done: string[] }) {
  const copy = useCopy(GOALS_COPY);
  if (!parts.length) return null;
  const finished = parts.filter((part) => done.includes(part)).length;
  const label = copy.partOf(Math.min(finished + 1, parts.length), parts.length);
  return (
    <span role="img" aria-label={label} className="flex gap-1">
      {parts.map((part, index) => (
        <i
          key={part}
          className={cn("h-1 flex-1 rounded-[2px] transition-colors duration-300", index <= finished ? "bg-apricot" : "bg-sand")}
        />
      ))}
    </span>
  );
}

/** The tutor asked whether to stop or keep going. */
export function CheckInCard({ onStop, onKeepGoing }: { onStop: () => void; onKeepGoing: () => void }) {
  const copy = useCopy(GOALS_COPY);
  return (
    <section aria-label={copy.checkInTitle} className="flex flex-col gap-3 rounded-md bg-sage-soft p-4">
      <span className="text-label text-sage-ink">{copy.checkInTitle}</span>
      <p className="m-0 text-small text-ink-soft">{copy.checkInBody}</p>
      <Button block onClick={onStop}>
        {copy.stop}
      </Button>
      <Button variant="ghost" block onClick={onKeepGoing}>
        {copy.keepGoing}
      </Button>
    </section>
  );
}

/** On the summary: the goals covered and the mistakes practiced. Never a grade. */
export function GoalsSummary({ summary }: { summary: SessionSummary }) {
  const copy = useCopy(GOALS_COPY);
  const goals = summary.goals ?? [];
  const targets = summary.targets ?? [];
  if (!goals.length && !targets.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {goals.length > 0 && (
        <section aria-label={copy.goalsLabel} className="flex flex-col gap-2">
          <span className="text-label text-taupe">{copy.goalsDone(goals.filter((g) => g.covered).length, goals.length)}</span>
          <GoalsStrip goals={goals.map((g) => g.id)} covered={goals.filter((g) => g.covered).map((g) => g.id)} />
        </section>
      )}
      {targets.length > 0 && (
        <section aria-label={copy.practice} className="flex flex-col gap-2">
          <span className="text-label text-taupe">
            {copy.practice} · {copy.practiceDone(targets.filter((t) => t.met).length, targets.length)}
          </span>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {targets.map((t) => (
              <li key={t.original} className="flex items-center justify-between gap-3 rounded-md bg-paper px-4 py-3 shadow-card">
                <span lang="en" className="text-small">
                  {t.correction}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-pill px-2.5 py-1 text-[12px] font-bold",
                    t.met ? "bg-sage-soft text-sage-ink" : "bg-sand-soft text-taupe",
                  )}
                >
                  {t.met ? copy.saidRight : copy.nextTime}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
