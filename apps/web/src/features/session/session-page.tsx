import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, Navigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { VoiceBall } from "@/components/voice-ball";
import type { Mode } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { CheckInCard, GoalsStrip, PartsBar } from "./goals";
import { ScaffoldCard, TrackBar } from "./guided-track";
import { ballTipSeen, markBallTipSeen } from "./ball-tip";
import { isMode, useModeInfo } from "./modes";
import { FINAL_FAILURES, labelClass, SESSION_COPY, stageFor } from "./session-copy";
import { CaptionCard, FadingCaption, HintCard, IconButton, PauseIcon, QuietLink, RevealCard, SupportNote, TranscriptIcon } from "./session-parts";
import { SummaryFlow } from "./session-summary";
import { TurnRing } from "./turn-ring";
import type { FailureCode } from "./session-state";
import { useTodayProgress } from "@/features/xp/use-today-progress";
import { XP_COPY } from "@/features/xp/xp-copy";
import { XpToast } from "@/features/xp/xp-toast";
import { useSessionCues } from "./use-session-cues";
import { type AutoRetry, useVoiceSession } from "./use-voice-session";

/** The live voice session: talk, get hints, see captions. Takes the whole screen. */
export function SessionPage() {
  const { mode } = useParams();
  if (!isMode(mode)) return <Navigate to="/" replace />;
  return <LiveSession mode={mode} />;
}

function LiveSession({ mode }: { mode: Mode }) {
  const session = useVoiceSession(mode);
  const modes = useModeInfo();
  const { stage: stageCopy, page, parts } = useCopy(SESSION_COPY);
  const { state } = session;
  const toast = useSessionCues(state);
  // XP per moment, from the server; without it the session simply shows no toasts.
  const { today } = useTodayProgress();
  const xpCopy = useCopy(XP_COPY);
  const toastXp: unknown = toast && today?.points[toast.reason];
  const [showTranscript, setShowTranscript] = useState(false);
  // Which caption the learner chose to read: a new tutor line starts hidden again.
  const [shownCaption, setShownCaption] = useState(-1);
  const tutorText = useRef<HTMLParagraphElement>(null);
  // The learner's last line that has already faded from the main screen.
  const [fadedCaption, setFadedCaption] = useState(-1);
  const { elapsed } = session;
  const stage = stageFor(state, stageCopy);
  const lastCaption = state.captions.at(-1);
  const lastTutor = state.captions.findLast((c) => c.who === "tutor");
  const { typing, setTyping } = session;
  const yourTurn = state.phase === "listening" || state.phase === "hearing";
  const ballAction =
    state.phase === "hearing" ? page.sendNow : state.phase === "speaking" ? page.stopTutor : undefined;
  const ballSize = !ballAction && state.hintStep > 0 ? 180 : 200;
  // First session only: say once that the ball can be tapped, until the learner taps it or the session ends.
  const [ballTip, setBallTip] = useState(() => !ballTipSeen());
  const tapBall = () => {
    if (ballTip) {
      markBallTipSeen();
      setBallTip(false);
    }
    session.tapBall();
  };
  const ending = state.phase === "ending" || state.phase === "ended";
  useEffect(() => {
    if (ending) markBallTipSeen();
  }, [ending]);

  if (state.phase === "ended") {
    return (
      <Screen>
        <SummaryFlow mode={mode} elapsed={elapsed} summary={state.summary} />
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
  // The learner's last words, until they fade: long enough to check the transcription.
  // Keyed by the caption, so it keeps its timer while the tutor answers.
  const yoursIndex = state.captions.findLastIndex((c) => c.who === "you");
  const yoursCaption = state.captions[yoursIndex];
  const yours =
    yoursCaption && yoursIndex >= state.captions.length - 2 && yoursIndex > fadedCaption ? (
      <FadingCaption key={yoursIndex} caption={yoursCaption} onGone={() => setFadedCaption(yoursIndex)} />
    ) : null;
  let tutorLine = -1;
  // A correction card carries the help itself, so the screen shows one card, not two.
  let helpInCard = false;
  if (state.phase === "failed" && state.failure) {
    bottom = (
      <FailureCard
        code={state.failure}
        kept={state.retry?.kind === "audio" || state.retry?.kind === "text"}
        autoRetry={session.autoRetry}
        onRetry={session.retry}
        onEnd={state.sessionId ? session.end : undefined}
      />
    );
  } else if (state.checkIn && yourTurn) {
    bottom = <CheckInCard onStop={session.end} onKeepGoing={session.keepGoing} />;
  } else if (state.revealed && lastTutor) {
    bottom = <RevealCard message={lastTutor.text} help={state.support} rule={state.rule} />;
    helpInCard = true;
  } else if (state.hintStep > 0 && lastTutor) {
    bottom = <HintCard step={state.hintStep} said={state.hintFor} tip={lastTutor.text} help={state.support} type={state.mistakeType} />;
    helpInCard = true;
  } else if (state.scaffold && !showTranscript) {
    // Words to say: one card with them replaces the tutor's line, which is in the transcript.
    bottom = (
      <>
        {yours}
        <ScaffoldCard key={state.scaffold} text={state.scaffold} track={state.track} />
      </>
    );
  } else if (lastCaption && !showTranscript) {
    tutorLine = lastCaption.who === "tutor" ? state.captions.length - 1 : -1;
    bottom = (
      <>
        {yours}
        {tutorLine >= 0 && shownCaption === tutorLine && <CaptionCard caption={lastCaption} textRef={tutorText} />}
      </>
    );
  }

  // The tutor's words stay hidden until a tap, so the learner listens first; another tap hides them again.
  const toggleTutorLine = () => {
    if (shownCaption === tutorLine) {
      setShownCaption(-1);
      return;
    }
    flushSync(() => setShownCaption(tutorLine));
    tutorText.current?.focus();
  };
  const canType = yourTurn && !typing;

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
      {/* The placement interview's tasks are not goals to tick off: it shows only how far the chat has come. */}
      {mode === "placement" ? (
        <PartsBar parts={state.goals} done={state.coveredGoals} />
      ) : (
        <GoalsStrip goals={state.goals} covered={state.coveredGoals} />
      )}
      {state.track && <TrackBar track={state.track} />}
      {/* Always mounted, so screen readers announce each toast; it floats over the ball or the transcript. */}
      <div aria-live="polite" className="pointer-events-none relative z-10 h-0">
        {toast && typeof toastXp === "number" && (
          <div className="absolute inset-x-0 top-2 flex justify-center">
            <XpToast
              key={toast.id}
              xp={toastXp}
              label={toast.reason === "self_corrected" ? xpCopy.fixedIt : xpCopy.goalCovered}
              tone={toast.tone}
            />
          </div>
        )}
      </div>

      {showTranscript ? (
        <ol aria-label={page.transcript} inert={state.phase === "paused"} className="m-0 flex min-h-0 flex-1 list-none flex-col gap-3 overflow-y-auto p-0">
          {state.captions.map((caption, i) => (
            <li key={i}>
              <CaptionCard caption={caption} />
            </li>
          ))}
        </ol>
      ) : (
        <div inert={state.phase === "paused"} className="relative flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="relative inline-flex">
            {ballAction ? (
              <VoiceBall state={stage.ball} size={ballSize} label={ballAction} onPress={tapBall} />
            ) : (
              <VoiceBall state={stage.ball} size={ballSize} dimmed={state.phase === "failed"} label="Voxa" />
            )}
            {state.phase === "hearing" && !typing && <TurnRing ballSize={ballSize} />}
          </div>
          <span aria-live="polite" className={`text-label ${labelClass(stage.ball)}`}>
            {stage.label}
          </span>
          <span aria-live="polite" className="text-caption text-taupe">
            {stage.hint}
          </span>
          {state.audioBlocked && <span className="text-caption text-taupe">{page.tapToHear}</span>}
          {ballTip && ballAction && (
            <p className="m-0 max-w-[300px] rounded-md bg-paper px-4 py-2.5 text-caption text-ink-soft shadow-card">{page.ballTip}</p>
          )}
        </div>
      )}

      <div inert={state.phase === "paused"} className="flex flex-col gap-3">
        <div aria-live="polite" className="flex flex-col gap-3">
          {bottom}
          {state.support && !helpInCard && state.phase !== "failed" && <SupportNote text={state.support} />}
        </div>
        {(tutorLine >= 0 || canType) && (
          <div className="flex flex-wrap items-center justify-center">
            {tutorLine >= 0 && (
              <QuietLink onClick={toggleTutorLine}>
                {shownCaption === tutorLine ? parts.hideTutorLine : parts.showTutorLine}
              </QuietLink>
            )}
            {tutorLine >= 0 && canType && (
              <span aria-hidden="true" className="text-caption text-sand">
                ·
              </span>
            )}
            {canType && <QuietLink onClick={() => setTyping(true)}>{page.typeInstead}</QuietLink>}
          </div>
        )}
        {yourTurn && typing && (
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
        )}
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

function FailureCard(props: {
  code: FailureCode;
  /** The learner's answer is kept and goes out again on retry. */
  kept: boolean;
  autoRetry: AutoRetry | null;
  onRetry: () => void;
  onEnd?: () => void;
}) {
  const { code, kept, autoRetry, onRetry, onEnd } = props;
  const { failure, page } = useCopy(SESSION_COPY);
  const copy = failure[code];
  const final = FINAL_FAILURES.includes(code);
  return (
    <section role="alert" aria-label={copy.title} className="flex flex-col gap-3 rounded-lg bg-paper p-5 shadow-card">
      <h1 className="m-0 text-heading">{copy.title}</h1>
      {kept && <p className="m-0 text-small">{page.keptAnswer}</p>}
      {autoRetry && (
        <p role="status" className="m-0 text-small text-taupe">
          {page.retrying(autoRetry.attempt, autoRetry.of)}
        </p>
      )}
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
