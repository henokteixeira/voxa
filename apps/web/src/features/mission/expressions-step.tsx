import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import { useReviewMicrophone } from "@/features/practice/use-review-microphone";
import { useApi } from "@/hooks/use-api";
import type { MissionExpression } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { MISSION_COPY } from "./mission-copy";

type Attempt = { kind: "asking"; problem?: "not_used" | "not_heard" | "failed" } | { kind: "checking" } | { kind: "used" };

/**
 * Step 2: the learner says each of the 3 expressions in a sentence of their own. It only checks that the
 * expression was used (no hint, no correction); a used one joins the spaced review on the server.
 * Skipping one is fine. `onDone` comes after the last one.
 */
export function ExpressionsStep(props: { missionId: string; language: string; expressions: MissionExpression[]; onDone: () => void }) {
  const { expressions, onDone } = props;
  // All 3 said before the learner left: the step only needs marking.
  const allSaid = expressions.every((e) => e.saidAt !== null);
  const done = useRef(onDone);
  useEffect(() => {
    if (allSaid) done.current();
  }, [allSaid]);
  if (allSaid) return null;
  return <Expressions {...props} />;
}

function Expressions(props: { missionId: string; language: string; expressions: MissionExpression[]; onDone: () => void }) {
  const { missionId, language, expressions } = props;
  const api = useApi();
  const copy = useCopy(MISSION_COPY);
  // Start on the first one not said yet (the step may be done in parts).
  const [index, setIndex] = useState(() => expressions.findIndex((e) => e.saidAt === null));
  const [said, setSaid] = useState(() => new Set(expressions.filter((e) => e.saidAt).map((e) => e.id)));
  const [attempt, setAttempt] = useState<Attempt>({ kind: "asking" });
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const current = expressions[index];

  async function check(utterance: string) {
    setAttempt({ kind: "checking" });
    try {
      const { used } = await api.sayExpression(missionId, current.id, utterance);
      if (!used) return setAttempt({ kind: "asking", problem: "not_used" });
      setSaid((ids) => new Set(ids).add(current.id));
      setAttempt({ kind: "used" });
    } catch {
      setAttempt({ kind: "asking", problem: "failed" });
    }
  }

  const listenFor = attempt.kind === "asking" && !typing ? current.id : null;
  const mic = useReviewMicrophone(listenFor, (wav) => {
    setAttempt({ kind: "checking" });
    api
      .transcribe(wav, language)
      .then((text) => (text ? check(text) : setAttempt({ kind: "asking", problem: "not_heard" })))
      .catch(() => setAttempt({ kind: "asking", problem: "failed" }));
  });
  const typed = typing || mic.available === false;

  function next() {
    if (index === expressions.length - 1) return props.onDone();
    setIndex(index + 1);
    setAttempt({ kind: "asking" });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    setDraft("");
    if (text) void check(text);
  }

  const problem = attempt.kind === "asking" ? attempt.problem : undefined;
  return (
    // The browser lets the microphone start only after a tap.
    <div className="contents" onPointerDown={mic.unlock}>
      <h1 className="m-0 text-title">{copy.expressionsTitle}</h1>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {expressions.map((e, i) => (
          <li
            key={e.id}
            lang="en"
            aria-current={i === index ? "step" : undefined}
            className={cn(
              "rounded-md px-4 py-3 font-serif text-[19px] leading-snug",
              said.has(e.id) ? "bg-sage-soft text-sage-ink" : i === index ? "bg-paper shadow-card" : "bg-sand-soft text-taupe",
            )}
          >
            {e.phrase}
          </li>
        ))}
      </ol>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <VoiceBall
          state={attempt.kind === "checking" ? "thinking" : attempt.kind === "used" ? "success" : mic.speaking ? "listening" : "idle"}
          size={140}
        />
        <span aria-live="polite" className={cn("text-label", attempt.kind === "used" ? "text-sage-ink" : "text-mist-ink")}>
          {attempt.kind === "checking" ? copy.checking : attempt.kind === "used" ? copy.used : !typed && mic.available ? copy.sayItAloud : ""}
        </span>
        {attempt.kind !== "used" && <p className="m-0 text-body text-ink-soft">{copy.sayIt(current.phrase)}</p>}
      </div>
      {problem && (
        <p role="alert" className="m-0 text-center text-caption text-honey-ink">
          {problem === "not_used" ? copy.notUsed : problem === "not_heard" ? copy.notHeard : copy.checkFailed}
        </p>
      )}
      {attempt.kind === "used" ? (
        <Button block onClick={next}>
          {copy.continue}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          {typed ? (
            <form onSubmit={submit} className="flex gap-2">
              <label htmlFor="mission-sentence" className="sr-only">
                {copy.yourSentence}
              </label>
              <input
                id="mission-sentence"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                lang="en"
                autoComplete="off"
                maxLength={2000}
                disabled={attempt.kind === "checking"}
                className="min-h-[52px] min-w-0 flex-1 rounded-md border-none bg-paper px-4 text-body shadow-[inset_0_0_0_1.5px_var(--color-sand)]"
              />
              <Button type="submit" disabled={attempt.kind === "checking"}>
                {copy.send}
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
          <Button variant="ghost" block disabled={attempt.kind === "checking"} onClick={next}>
            {copy.skip}
          </Button>
        </div>
      )}
    </div>
  );
}
