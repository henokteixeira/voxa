import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import { useApi } from "@/hooks/use-api";
import type { ReviewSubject } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { comesBack } from "./format";
import { PRACTICE_COPY } from "./practice-copy";
import { type ReviewResult, ReviewRun } from "./review-run";

import { PRACTICE_PATH } from "./paths";

/** The whole-screen voice review: what is due (or one item), then when each one comes back. */
export function ReviewPage() {
  // A new address is a new review.
  return <Review key={useLocation().search} />;
}

function Review() {
  const api = useApi();
  const copy = useCopy(PRACTICE_COPY);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const pattern = params.get("pattern");
  const word = params.get("word");
  const one: ReviewSubject | null = pattern ? { kind: "pattern", id: pattern } : word ? { kind: "new_word", id: word } : null;
  const [subjects, setSubjects] = useState<ReviewSubject[] | "loading" | "failed">(one ? [one] : "loading");
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<ReviewResult[] | null>(null);

  useEffect(() => {
    if (pattern || word) return;
    let active = true;
    api
      .reviewOverview()
      .then((overview) => active && setSubjects(overview.due.map((item) => item.subject)))
      .catch(() => active && setSubjects("failed"));
    return () => {
      active = false;
    };
  }, [api, attempt, pattern, word]);

  let content;
  if (results) content = <ReviewDone results={results} />;
  else if (subjects === "loading")
    content = (
      <div className="flex flex-1 items-center justify-center">
        <VoiceBall state="thinking" size={140} />
      </div>
    );
  else if (subjects === "failed" || subjects.length === 0)
    content = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="m-0 text-body text-ink-soft">{subjects === "failed" ? copy.loadFailed : copy.reviewEmpty}</p>
        {subjects === "failed" && (
          <Button
            variant="secondary"
            onClick={() => {
              setSubjects("loading");
              setAttempt((n) => n + 1);
            }}
          >
            {copy.tryAgain}
          </Button>
        )}
        <Button variant="ghost" asChild>
          <Link to={PRACTICE_PATH}>{copy.back}</Link>
        </Button>
      </div>
    );
  else
    content = (
      <ReviewRun
        subjects={subjects}
        onDone={(answered) => (answered.length ? setResults(answered) : navigate(PRACTICE_PATH, { replace: true }))}
      />
    );

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[480px] flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-7 pb-[max(32px,env(safe-area-inset-bottom))]">
      {content}
    </main>
  );
}

/** When each item comes back: no score, no count of misses. */
function ReviewDone({ results }: { results: ReviewResult[] }) {
  const copy = useCopy(PRACTICE_COPY);
  const { locale } = useLocale();
  const [now] = useState(() => new Date());
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <VoiceBall state="success" size={140} />
        <h1 className="m-0 text-title">{copy.reviewDone}</h1>
        <ul className="m-0 flex w-full list-none flex-col gap-2.5 rounded-md bg-paper p-4 text-left shadow-card">
          {results.map((r) => (
            <li key={`${r.subject.kind}-${r.subject.id}`} className="flex justify-between gap-3 text-small">
              <span>{r.name}</span>
              <span className="text-caption text-taupe">{comesBack(r.nextDueAt, now, locale)}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-caption text-taupe">{copy.reviewDoneNote}</p>
      </div>
      <Button block asChild>
        <Link to={PRACTICE_PATH} replace>
          {copy.done}
        </Link>
      </Button>
    </>
  );
}
