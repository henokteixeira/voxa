import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { VoiceBall } from "@/components/voice-ball";
import { useApi } from "@/hooks/use-api";
import type { CheckInResult } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { CHECK_IN_COPY } from "./check-in-copy";
import { CheckInComparison } from "./check-in-result";

/** One past check-in, opened from Progress: its comparison and recordings. */
export function CheckInDetailPage() {
  const { checkInId = "" } = useParams();
  const api = useApi();
  const copy = useCopy(CHECK_IN_COPY);
  const [result, setResult] = useState<CheckInResult | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    api
      .checkIn(checkInId)
      .then((loaded) => active && setResult(loaded))
      .catch(() => active && setResult(null));
    return () => {
      active = false;
    };
  }, [api, checkInId]);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col gap-5 px-5 pt-7 pb-8">
      <div className="flex min-h-11 items-center justify-between">
        <Link
          to="/progress"
          aria-label={copy.back}
          className="inline-flex size-11 items-center justify-center rounded-full bg-paper text-ink shadow-card"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className="text-label text-taupe">{copy.label}</span>
        <span className="w-11" />
      </div>
      {result === undefined && (
        <div className="flex flex-1 items-center justify-center">
          <VoiceBall state="thinking" size={140} />
        </div>
      )}
      {result === null && <p className="m-0 flex-1 text-center text-body text-ink-soft">{copy.loadFailed}</p>}
      {result && <CheckInComparison result={result} doneTo="/progress" />}
    </div>
  );
}
