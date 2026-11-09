import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { useApi } from "@/hooks/use-api";
import type { CheckInOverview } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { CHECK_IN_COPY } from "./check-in-copy";
import { useCheckInDate } from "./check-in-format";
import { CHECK_IN_PATH } from "./check-in-page";

/** The last check-ins shown in Progress. */
const SHOWN = 6;

/** Progress: words per minute of each check-in, oldest to newest; a bar opens that check-in's result. */
export function CheckInHistory() {
  const api = useApi();
  const copy = useCopy(CHECK_IN_COPY);
  const date = useCheckInDate();
  const id = useId();
  const [overview, setOverview] = useState<CheckInOverview | null>(null);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => api.checkIns())
      .then((loaded) => active && setOverview(loaded))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api]);

  if (!overview || overview.checkIns.length === 0) return null;
  const shown = overview.checkIns.slice(0, SHOWN).reverse();
  const top = Math.max(1, ...shown.map((c) => c.wordsPerMinute ?? 0));
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-lg bg-paper p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="m-0 text-label text-taupe">
          {copy.historyTitle}
        </h2>
        <span className="text-caption text-taupe">{copy.historyEvery}</span>
      </div>
      <ol className="m-0 flex h-[130px] list-none items-end gap-2.5 p-0">
        {shown.map((checkIn, i) => (
          <li key={checkIn.id} className="flex h-full flex-1">
            <Link
              to={`${CHECK_IN_PATH}/${checkIn.id}`}
              aria-label={copy.historyItem(date(checkIn.recordedAt), checkIn.wordsPerMinute)}
              className="flex h-full w-full flex-col items-center justify-end gap-1.5 text-ink no-underline"
            >
              <span aria-hidden="true" className="text-small font-bold tabular-nums">
                {checkIn.wordsPerMinute ?? "–"}
              </span>
              <span
                aria-hidden="true"
                style={{ height: `${Math.max(4, Math.round(((checkIn.wordsPerMinute ?? 0) / top) * 80))}px` }}
                className={cn("w-full rounded-t-md", i === shown.length - 1 ? "bg-sage" : "bg-mist")}
              />
              <span aria-hidden="true" className="text-caption text-taupe">
                {date(checkIn.recordedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <span className="text-caption text-taupe">{copy.next(date(overview.dueAt))}</span>
    </section>
  );
}
