import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useApi } from "@/hooks/use-api";
import { useCopy } from "@/lib/i18n/locale";
import { REVIEW_PATH } from "./paths";
import { PRACTICE_COPY } from "./practice-copy";

/** On Today, only when something is due: the voice review, one tap away. Says nothing when it can't load. */
export function TodayReviewCard() {
  const api = useApi();
  const copy = useCopy(PRACTICE_COPY);
  const [due, setDue] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => api.reviewOverview())
      .then((overview) => active && setDue(overview.due.length))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api]);

  if (due === 0) return null;
  return (
    <Link
      to={REVIEW_PATH}
      className="flex min-h-14 items-center gap-3 rounded-md bg-paper px-5 py-4 text-ink no-underline shadow-card transition-[transform,background-color] duration-150 hover:bg-sand-soft motion-safe:active:scale-[0.98]"
    >
      <span aria-hidden="true" className="size-3.5 shrink-0 rounded-full bg-mist" />
      <span className="flex flex-1 flex-col gap-0.5">
        <b className="text-body-strong">{copy.todayReview(due)}</b>
        <span className="text-caption text-taupe">{copy.dueNote}</span>
      </span>
    </Link>
  );
}
