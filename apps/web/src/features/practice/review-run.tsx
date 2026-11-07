import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import { useApi } from "@/hooks/use-api";
import type { ReviewAnswer, ReviewCard, ReviewSubject } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { comesBack } from "./format";
import { REVIEW_COPY } from "./review-copy";
import { useReviewMicrophone } from "./use-review-microphone";

/** One answered item: what it was and when it comes back. */
export interface ReviewResult {
  subject: ReviewSubject;
  name: string;
  recalled: boolean;
  nextDueAt: string;
}

type Step =
  | { kind: "loading" }
  | { kind: "failed" }
  /** `problem`: the last answer couldn't be checked, or nothing was heard. */
  | { kind: "asking"; card: ReviewCard; problem?: "failed" | "not_heard" }
  | { kind: "checking"; card: ReviewCard }
  | { kind: "answered"; card: ReviewCard; said: string | null; answer: ReviewAnswer };

/**
 * A short review, one item at a time: a cue in the learner's language, their answer from memory, then
 * "That's it" or "Almost" with one way to say it and the rule. Nothing is graded: a miss only brings the
 * item back sooner. `onDone` gets the answered items, also when the learner closes early.
 */
export function ReviewRun({ subjects, onDone }: { subjects: ReviewSubject[]; onDone: (results: ReviewResult[]) => void }) {
  const api = useApi();
  const copy = useCopy(REVIEW_COPY);
  const { locale } = useLocale();
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [results, setResults] = useState<ReviewResult[]>([]);
  const [now] = useState(() => new Date());
  // Each try at loading the current card; "Try again" asks once more.
  const [attempt, setAttempt] = useState(0);

  const { kind, id } = subjects[index];
  useEffect(() => {
    // A card still loading when the learner moved on must not replace the next one.
    let active = true;
    api
      .reviewCard({ kind, id })
      .then((card) => active && setStep({ kind: "asking", card }))
      .catch(() => active && setStep({ kind: "failed" }));
    return () => {
      active = false;
    };
  }, [api, kind, id, attempt]);

  function retry() {
    setStep({ kind: "loading" });
    setAttempt((n) => n + 1);
  }

  async function answer(card: ReviewCard, said: string | null) {
    setStep({ kind: "checking", card });
    try {
      const result = await api.answerReview(card.cardId, said);
      setResults((r) => [...r, { subject: card.item.subject, name: card.item.name, recalled: result.recalled, nextDueAt: result.nextDueAt }]);
      setStep({ kind: "answered", card, said, answer: result });
    } catch {
      setStep({ kind: "asking", card, problem: "failed" });
    }
  }

  const [typing, setTyping] = useState(false);
  const asking = step.kind === "asking" ? step.card : null;
  const mic = useReviewMicrophone(Boolean(asking) && !typing, (wav) => {
    if (!asking) return;
    setStep({ kind: "checking", card: asking });
    api
      .transcribe(wav, asking.item.language)
      .then((said) =>
        said ? answer(asking, said) : setStep({ kind: "asking", card: asking, problem: "not_heard" }),
      )
      .catch(() => setStep({ kind: "asking", card: asking, problem: "failed" }));
  });
  const typed = typing || mic.available === false;

  function submit(event: FormEvent<HTMLFormElement>, card: ReviewCard) {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get("answer") ?? "").trim();
    if (text) void answer(card, text);
  }

  const last = index === subjects.length - 1;
  function next() {
    if (last) return onDone(results);
    setStep({ kind: "loading" });
    setIndex(index + 1);
  }

  return (
    // The browser lets the microphone start only after a tap.
    <div className="contents" onPointerDown={mic.unlock}>
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          aria-label={copy.close}
          // An answer being checked is saved on the server: wait for it, so it is listed too.
          disabled={step.kind === "checking"}
          onClick={() => onDone(results)}
          className="inline-flex disabled:opacity-40 size-11 cursor-pointer items-center justify-center rounded-full border-none bg-paper text-ink shadow-card"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <span className="text-caption text-taupe tabular-nums">{copy.progress(index + 1, subjects.length)}</span>
      </div>
      <div aria-hidden="true" className="flex gap-1.5">
        {subjects.map((s, i) => (
          <i
            key={`${s.kind}-${s.id}`}
            className={cn(
              "h-1 flex-1 rounded-pill",
              i < index || (i === index && step.kind === "answered") ? "bg-sage-strong" : i === index ? "bg-ink" : "bg-sand",
            )}
          />
        ))}
      </div>

      {step.kind === "failed" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="m-0 text-body text-ink-soft">{copy.failed}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={retry}>
              {copy.retry}
            </Button>
            <Button variant="ghost" onClick={next}>
              {copy.skip}
            </Button>
          </div>
        </div>
      )}

      {step.kind === "loading" && (
        <div className="flex flex-1 items-center justify-center">
          <VoiceBall state="thinking" size={140} />
        </div>
      )}

      {(step.kind === "asking" || step.kind === "checking") && (
        <>
          <section aria-label={copy.sayIt} className="flex flex-col gap-2 rounded-md bg-paper px-5 py-4 shadow-card">
            <span className="text-caption font-bold text-honey-ink">{copy.sayIt}</span>
            <span lang="pt-BR" className="font-serif text-[22px] leading-snug">
              “{step.card.cue}”
            </span>
          </section>
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <VoiceBall
              state={step.kind === "checking" ? "thinking" : mic.speaking ? "listening" : "idle"}
              size={160}
            />
            <span aria-live="polite" className="text-label text-mist-ink">
              {step.kind === "checking" ? copy.checking : typed ? "" : mic.available ? copy.sayItAloud : ""}
            </span>
          </div>
          {typed ? (
            <form onSubmit={(e) => submit(e, step.card)} className="flex gap-2">
              <label htmlFor="review-answer" className="sr-only">
                {copy.yourAnswer}
              </label>
              <input
                id="review-answer"
                name="answer"
                lang="en"
                autoFocus
                autoComplete="off"
                maxLength={2000}
                disabled={step.kind === "checking"}
                className="min-h-[52px] min-w-0 flex-1 rounded-md border-none bg-paper px-4 text-body shadow-[inset_0_0_0_1.5px_var(--color-sand)]"
              />
              <Button type="submit" disabled={step.kind === "checking"}>
                {copy.check}
              </Button>
            </form>
          ) : (
            mic.available && (
              <button
                type="button"
                onClick={() => setTyping(true)}
                className="cursor-pointer self-center border-none bg-transparent p-0 text-small text-taupe underline-offset-4 hover:text-ink hover:underline"
              >
                {copy.typeInstead}
              </button>
            )
          )}
          {step.kind === "asking" && step.problem && (
            <p role="alert" className="m-0 text-center text-caption text-honey-ink">
              {step.problem === "failed" ? copy.answerFailed : copy.notHeard}
            </p>
          )}
          <Button variant="ghost" block disabled={step.kind === "checking"} onClick={() => void answer(step.card, null)}>
            {copy.dontKnow}
          </Button>
        </>
      )}

      {step.kind === "answered" && (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <VoiceBall state={step.answer.recalled ? "success" : "hint"} size={140} />
            <span role="status" className={cn("text-label", step.answer.recalled ? "text-sage-ink" : "text-honey-ink")}>
              {step.answer.recalled ? copy.gotIt : copy.almost}
            </span>
          </div>
          <section
            aria-label={step.answer.recalled ? copy.youSaid : copy.oneWay}
            className="flex flex-col gap-2 rounded-md bg-sage-soft px-5 py-4"
          >
            <span className="text-caption font-bold text-sage-ink">{step.answer.recalled ? copy.youSaid : copy.oneWay}</span>
            <span lang="en" className="font-serif text-[19px] leading-snug">
              {step.answer.recalled && step.said ? step.said : step.answer.answer}
            </span>
            <span className="text-small text-ink-soft">
              <b>{step.card.item.name}.</b> {step.answer.rule}
            </span>
          </section>
          {!step.answer.recalled && (
            <span className="text-center text-caption text-taupe">
              {copy.sayOnceMore(comesBack(step.answer.nextDueAt, now, locale))}
            </span>
          )}
          <Button block onClick={next}>
            {last ? copy.finish : copy.next}
          </Button>
        </>
      )}
    </div>
  );
}
