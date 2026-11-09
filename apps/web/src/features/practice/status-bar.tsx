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

/**
 * How a type is going: a bar where each status takes the share of its items, with the counts written
 * under it, so the status never depends on color alone. The bar is decorative; the counts are the text.
 */
export function StatusBar({ counts, className }: { counts: StatusCounts; className?: string }) {
  const shown = ORDER.filter((s) => counts[s] > 0);
  return (
    <span className="flex flex-col gap-1.5">
      <span aria-hidden="true" className={cn("flex h-2 gap-0.5 overflow-hidden rounded-[3px] bg-sand", className)}>
        {shown.map((s) => (
          <span key={s} className={cn("h-full min-w-1.5 first:rounded-l-[3px] last:rounded-r-[3px]", STATUS_FILL[s])} style={{ flexGrow: counts[s] }} />
        ))}
      </span>
      <StatusCountsText counts={counts} />
    </span>
  );
}

/** "2 new · 1 improving · 1 mastered", leaving out the statuses with nothing in them. */
export function StatusCountsText({ counts }: { counts: StatusCounts }) {
  const copy = useCopy(PRACTICE_COPY);
  const shown = ORDER.filter((s) => counts[s] > 0);
  return (
    <span className="text-caption text-taupe">
      {shown.map((s, i) => (
        <span key={s}>
          {i > 0 && " · "}
          <b className="font-semibold text-ink-soft tabular-nums">{counts[s]}</b> {copy.status[s].toLowerCase()}
        </span>
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
