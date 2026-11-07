import type { ReviewStatus } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { reviewDay } from "./format";
import { PRACTICE_COPY } from "./practice-copy";
import type { StatusCounts } from "./practice-types";

/** Status colors: honey new, mist improving, sage mastered. */
const STATUS_FILL: Record<ReviewStatus, string> = {
  new: "bg-honey",
  improving: "bg-mist",
  mastered: "bg-sage-strong",
};

const ORDER: ReviewStatus[] = ["new", "improving", "mastered"];

/** How a type is going, as one thin bar: each status takes the share of its items. Read out as counts. */
export function StatusBar({ counts, className }: { counts: StatusCounts; className?: string }) {
  const copy = useCopy(PRACTICE_COPY);
  const spoken = ORDER.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${copy.status[s].toLowerCase()}`)
    .join(", ");
  return (
    <span role="img" aria-label={spoken} className={cn("flex h-1 overflow-hidden rounded-[2px] bg-sand", className)}>
      {ORDER.filter((s) => counts[s] > 0).map((s) => (
        <span key={s} className={cn("h-full", STATUS_FILL[s], "[&+span]:ml-0.5")} style={{ flexGrow: counts[s] }} />
      ))}
    </span>
  );
}

/** A status dot before a pattern or word, with its name for screen readers. */
export function StatusDot({ status }: { status: ReviewStatus }) {
  const copy = useCopy(PRACTICE_COPY);
  return (
    <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_FILL[status])}>
      <span className="sr-only">{copy.status[status]} · </span>
    </span>
  );
}

/** "Review today", "Review Tue", "Mastered" or "Not scheduled": what a learner can act on. */
export function When({ status, dueAt, now }: { status: ReviewStatus; dueAt: string | null; now: Date }) {
  const copy = useCopy(PRACTICE_COPY);
  const { locale } = useLocale();
  const text = status === "mastered" ? copy.status.mastered : dueAt ? copy.reviewOn(reviewDay(dueAt, now, locale)) : copy.notScheduled;
  return <span className="shrink-0 text-caption text-taupe">{text}</span>;
}
