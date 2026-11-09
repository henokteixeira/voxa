import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useCopy } from "@/lib/i18n/locale";
import { CHECK_IN_COPY } from "./check-in-copy";
import { CHECK_IN_PATH } from "./check-in-page";

/** On Today, only when the check-in is due; it stays until it is done. Says nothing when it can't load. */
export function TodayCheckInCard() {
  const api = useApi();
  const copy = useCopy(CHECK_IN_COPY);
  const [due, setDue] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => api.checkIns())
      .then((overview) => active && setDue(overview.due))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api]);

  if (!due) return null;
  return (
    <section aria-label={copy.every} className="flex flex-col gap-2 rounded-lg bg-honey-soft px-5 py-4 text-ink">
      <span className="text-label text-honey-ink">{copy.every}</span>
      <b className="text-body-strong">{copy.todayTitle}</b>
      <span className="text-caption text-honey-ink">{copy.todayBody}</span>
      <Button block asChild className="mt-1">
        <Link to={CHECK_IN_PATH}>{copy.start}</Link>
      </Button>
    </section>
  );
}
