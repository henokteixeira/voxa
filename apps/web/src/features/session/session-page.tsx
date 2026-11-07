import { type FormEvent, type ReactNode, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { VoiceBall } from "@/components/voice-ball";
import type { Mode } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { CheckInCard, GoalsStrip } from "./goals";
import { isMode, useModeInfo } from "./modes";
import { FINAL_FAILURES, labelClass, SESSION_COPY, stageFor } from "./session-copy";
import { CaptionCard, HintCard, IconButton, LatestCaption, PauseIcon, QuietLink, RevealCard, SupportNote, TranscriptIcon } from "./session-parts";
import { SummaryFlow } from "./session-summary";
import type { FailureCode } from "./session-state";
import { useVoiceSession } from "./use-voice-session";

/** What the confidence check-in hands to the live session (router state). */
export interface CheckInState {
  confidenceBefore?: number;
}

/** The live voice session: talk, get hints, see captions. Takes the whole screen. */
export function SessionPage() {
  const { mode } = useParams();
  const checkIn = useLocation().state as CheckInState | null;
  if (!isMode(mode)) return <Navigate to="/" replace />;
  return <LiveSession mode={mode} confidenceBefore={checkIn?.confidenceBefore} />;
}

function LiveSession({ mode, confidenceBefore }: { mode: Mode; confidenceBefore?: number }) {
  const session = useVoiceSession(mode, confidenceBefore);
  const modes = useModeInfo();
  const { stage: stageCopy, page } = useCopy(SESSION_COPY);
  const { state } = session;
  const [showTranscript, setShowTranscript] = useState(false);
  // Which caption the learner chose to read: a new tutor line starts hidden again.
  const [shownCaption, setShownCaption] = useState(-1);
  const { elapsed } = session;
  const stage = stageFor(state, stageCopy);
  const lastCaption = state.captions.at(-1);
  const lastTutor = state.captions.findLast((c) => c.who === "tutor");
  const { typing, setTyping } = session;
  const yourTurn = state.phase === "listening" || state.phase === "hearing";
  const ballAction =
    state.phase === "hearing" ? page.sendNow : state.phase === "speaking" ? page.stopTutor : undefined;

  if (state.phase === "ended") {
    return (
      <Screen>
        <SummaryFlow mode={mode} elapsed={elapsed} summary={state.summary} onRate={session.rateAfter} />
      </Screen>
    );
  }
  if (state.phase === "ending") {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <VoiceBall state="thinking" size={160} />
          <h1 className="m-0 text-title">{page.saving}</h1>
        </div>
      </Screen>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("text") as HTMLInputElement;
    const text = field.value.trim();
    if (!text) return;
    session.sendText(text);
  };

  let bottom: ReactNode = null;
  // A correction card carries the help itself, so the screen shows one card, not two.
  let helpInCard = false;
  if (state.phase === "failed" && state.failure) {
    bottom = <FailureCard code={state.failure} onRetry={session.retry} onEnd={state.sessionId ? session.end : undefined} />;
  } else if (state.checkIn && yourTurn) {
    bottom = <CheckInCard onStop={session.end} onKeepGoing={session.keepGoing} />;
  } else if (state.revealed && lastTutor) {
    bottom = <RevealCard message={lastTutor.text} help={state.support} />;
    helpInCard = true;
  } else if (state.hintStep > 0 && lastTutor) {
    bottom = <HintCard step={state.hintStep} said={state.hintFor} tip={lastTutor.text} help={state.support} />;
    helpInCard = true;
  } else if (lastCaption && !showTranscript) {
    const index = state.captions.length - 1;
    // The learner's own words stay until they speak again, so there is time to check the transcription.
    const yours = lastCaption.who === "tutor" ? state.captions.at(-2) : undefined;
    bottom = (
      <>
        {yours?.who === "you" && <CaptionCard caption={yours} />}
        <LatestCaption
          key={index}
          caption={lastCaption}
          shown={shownCaption === index}
          onShow={() => setShownCaption(index)}
        />
      </>
    );
  }

  return (
    <Screen onPointerDown={session.unlock}>
      <header inert={state.phase === "paused"} className="flex min-h-11 items-center justify-between gap-3">
        <IconButton label={page.pause} onClick={session.pause}>
          <PauseIcon />
        </IconButton>
        <span className="flex flex-col items-center">
          <b className="text-sm">{modes[mode].title}</b>
          <span className="text-caption text-taupe tabular-nums">{elapsed}</span>
        </span>
        <IconButton
          label={showTranscript ? page.hideTranscript : page.showTranscript}
          onClick={() => setShowTranscript((v) => !v)}
        >
          <TranscriptIcon />
        </IconButton>
      </header>
      {/* The placement interview's tasks are not goals to tick off: showing them would feel like a test. */}
      {mode !== "placement" && <GoalsStrip goals={state.goals} covered={state.coveredGoals} />}

      {showTranscript ? (
        <ol aria-label={page.transcript} inert={state.phase === "paused"} className="m-0 flex min-h-0 flex-1 list-none flex-col gap-3 overflow-y-auto p-0">
          {state.captions.map((caption, i) => (
            <li key={i}>
              <CaptionCard caption={caption} />
            </li>
          ))}
        </ol>
      ) : (
        <div inert={state.phase === "paused"} className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          {ballAction ? (
            <VoiceBall state={stage.ball} size={200} label={ballAction} onPress={session.tapBall} />
          ) : (
            <VoiceBall state={stage.ball} size={state.hintStep > 0 ? 180 : 200} dimmed={state.phase === "failed"} label="Voxa" />
          )}
          <span aria-live="polite" className={`text-label ${labelClass(stage.ball)}`}>
            {stage.label}
          </span>
          <span aria-live="polite" className="text-caption text-taupe">
            {stage.hint}
          </span>
          {state.audioBlocked && <span className="text-caption text-taupe">{page.tapToHear}</span>}
        </div>
      )}

      <div inert={state.phase === "paused"} className="flex flex-col gap-3">
        <div aria-live="polite" className="flex flex-col gap-3">
          {bottom}
          {state.support && !helpInCard && state.phase !== "failed" && <SupportNote text={state.support} />}
        </div>
        {yourTurn &&
          (typing ? (
            <form onSubmit={submit} className="flex gap-2">
              <label htmlFor="typed-turn" className="sr-only">
                {page.yourAnswer}
              </label>
              <input
                id="typed-turn"
                name="text"
                autoFocus
                autoComplete="off"
                maxLength={2000}
                className="min-h-[52px] min-w-0 flex-1 rounded-md border-none bg-paper px-4 text-body shadow-[inset_0_0_0_1.5px_var(--color-sand)]"
              />
              <Button type="submit">{page.send}</Button>
            </form>
          ) : (
            <QuietLink onClick={() => setTyping(true)}>{page.typeInstead}</QuietLink>
          ))}
      </div>

      {state.phase === "paused" && (
        <PausedSheet elapsed={elapsed} onResume={session.resume} onRepeat={session.repeatLast} onEnd={session.end} />
      )}
    </Screen>
  );
}

function Screen({ children, onPointerDown }: { children: ReactNode; onPointerDown?: () => void }) {
  return (
    <main
      onPointerDown={onPointerDown}
      className="relative mx-auto flex h-dvh w-full max-w-[480px] flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-7 pb-[max(32px,env(safe-area-inset-bottom))]"
    >
      {children}
    </main>
  );
}

function FailureCard({ code, onRetry, onEnd }: { code: FailureCode; onRetry: () => void; onEnd?: () => void }) {
  const { failure, page } = useCopy(SESSION_COPY);
  const copy = failure[code];
  const final = FINAL_FAILURES.includes(code);
  return (
    <section role="alert" aria-label={copy.title} className="flex flex-col gap-3 rounded-lg bg-paper p-5 shadow-card">
      <h1 className="m-0 text-heading">{copy.title}</h1>
      <p className="m-0 text-small text-ink-soft">{copy.body}</p>
      {copy.command && (
        <code className="rounded-[10px] bg-sand-soft px-3 py-2.5 font-mono text-[13px] break-all">{copy.command}</code>
      )}
      {copy.steps && (
        <ol className="m-0 flex flex-col gap-2 pl-5 text-small">
          {copy.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {!final && (
        <Button block onClick={onRetry}>
          {copy.action}
        </Button>
      )}
      {onEnd ? (
        <Button variant={final ? "primary" : "ghost"} block onClick={onEnd}>
          {page.endSession}
        </Button>
      ) : (
        <Button variant="ghost" block asChild>
          <Link to="/">{page.backToToday}</Link>
        </Button>
      )}
    </section>
  );
}

function PausedSheet(props: { elapsed: string; onResume: () => void; onRepeat: () => void; onEnd: () => void }) {
  const { page } = useCopy(SESSION_COPY);
  // Escape and the backdrop resume: pausing is never a dead end.
  return (
    <Sheet label={page.paused} onClose={props.onResume}>
      {(close) => (
        <>
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-heading">{page.paused}</h2>
            <span className="text-caption text-taupe tabular-nums">{props.elapsed}</span>
          </div>
          <Button block onClick={close} autoFocus>
            {page.resume}
          </Button>
          <Button
            variant="secondary"
            block
            onClick={() => {
              props.onResume();
              props.onRepeat();
            }}
          >
            {page.repeatLast}
          </Button>
          <Button variant="ghost" block onClick={props.onEnd}>
            {page.endSession}
          </Button>
        </>
      )}
    </Sheet>
  );
}
