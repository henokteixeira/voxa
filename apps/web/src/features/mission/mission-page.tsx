import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import { CHECK_IN_PATH } from "@/features/check-in/paths";
import { FasterRun } from "@/features/faster/faster-run";
import { ReviewRun } from "@/features/practice/review-run";
import { useModeInfo } from "@/features/session/modes";
import { TALK_PATH } from "@/features/talk/talk-page";
import { useApi } from "@/hooks/use-api";
import type { MarkedMissionStep, MissionModel, MissionView, ReviewSubject } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { ExpressionsStep } from "./expressions-step";
import { ListenStep } from "./listen-step";
import { MISSION_COPY } from "./mission-copy";
import { StepsBar } from "./steps-bar";
import {
  currentStep,
  loadMissionTakeaways,
  MISSION_PATH,
  MISSION_STEPS,
  missionSessionPath,
  type MissionStepName,
  STEP_MINUTES,
} from "./mission-steps";

/** How many items step 5 reviews at most: it is a 3-minute step. */
const REVIEW_LIMIT = 5;

/**
 * The daily mission, whole screen: it opens on the first step not done, so it can be done in parts the same day.
 * Every step can be left with the close button; what is done stays done.
 */
export function MissionPage() {
  const api = useApi();
  const copy = useCopy(MISSION_COPY);
  const [view, setView] = useState<MissionView | "loading" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .missionToday()
      .then((mission) => active && setView(mission))
      .catch(() => active && setView("failed"));
    return () => {
      active = false;
    };
  }, [api, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const mark = useCallback(
    (mission: MissionView, step: MarkedMissionStep) =>
      api.markMissionStep(mission.id, step).then(setView, () => setView("failed")),
    [api],
  );

  let content: ReactNode;
  if (view === "loading") content = <Busy />;
  else if (view === "failed")
    content = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="m-0 text-body text-ink-soft">{copy.loadFailed}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setView("loading");
            reload();
          }}
        >
          {copy.tryAgain}
        </Button>
      </div>
    );
  else content = <Step key={currentStep(view.steps) ?? "done"} view={view} mark={(step) => void mark(view, step)} onView={setView} />;

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[480px] flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-7 pb-[max(32px,env(safe-area-inset-bottom))]">
      {content}
    </main>
  );
}

function Busy() {
  return (
    <div aria-busy="true" className="flex flex-1 items-center justify-center">
      <VoiceBall state="thinking" size={140} />
    </div>
  );
}

/** The close button and where the learner is in the mission. */
function StepHeader({ step }: { step: MissionStepName }) {
  const copy = useCopy(MISSION_COPY);
  const index = step === "checkIn" ? -1 : MISSION_STEPS.indexOf(step);
  return (
    <>
      <div className="flex min-h-11 items-center justify-between">
        <Link
          to="/"
          aria-label={copy.close}
          className="inline-flex size-11 items-center justify-center rounded-full bg-paper text-ink shadow-card"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <span className="text-label text-taupe">{step === "checkIn" ? copy.checkInLabel : copy.stepOf(index + 1, MISSION_STEPS.length)}</span>
      </div>
      <StepsBar now={index} />
    </>
  );
}

function Step({ view, mark, onView }: { view: MissionView; mark: (step: MarkedMissionStep) => void; onView: (view: MissionView) => void }) {
  const step = currentStep(view.steps);
  if (step === null) return <MissionDone view={view} />;
  return (
    <>
      {step !== "review" && <StepHeader step={step} />}
      {step === "checkIn" && <CheckInStep />}
      {(step === "listen" || step === "expressions") && <ModelSteps view={view} step={step} mark={mark} />}
      {step === "task" && <TaskStep view={view} />}
      {step === "faster" && (view.sessionId ? <FasterStep sessionId={view.sessionId} onView={onView} /> : <Navigate to="/" replace />)}
      {step === "review" && <ReviewStep view={view} onDone={() => mark("review")} />}
    </>
  );
}

function CheckInStep() {
  const copy = useCopy(MISSION_COPY);
  return (
    <Intro title={copy.checkInTitle} meta={copy.checkInBody}>
      <Button block asChild>
        <Link to={`${CHECK_IN_PATH}?next=${encodeURIComponent(MISSION_PATH)}`}>{copy.start}</Link>
      </Button>
    </Intro>
  );
}

/** Steps 1 and 2 both need the model: someone else doing the task, and the 3 expressions taken from it. */
function ModelSteps({ view, step, mark }: { view: MissionView; step: "listen" | "expressions"; mark: (step: MarkedMissionStep) => void }) {
  const api = useApi();
  const copy = useCopy(MISSION_COPY);
  const [model, setModel] = useState<MissionModel | "loading" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    api
      .missionModel(view.id)
      .then((m) => active && setModel(m))
      .catch(() => active && setModel("failed"));
    return () => {
      active = false;
    };
  }, [api, view.id, attempt]);

  if (model === "loading") return <Busy />;
  if (model === "failed")
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="m-0 text-body text-ink-soft">{copy.loadFailed}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setModel("loading");
            setAttempt((n) => n + 1);
          }}
        >
          {copy.tryAgain}
        </Button>
        <Button variant="ghost" onClick={() => navigate("/")}>
          {copy.backToToday}
        </Button>
      </div>
    );
  if (step === "listen")
    return (
      <ListenStep
        missionId={view.id}
        model={model}
        // Listening once is enough: the step is kept even if the learner leaves before Continue.
        onListened={() => void api.markMissionStep(view.id, "listen").catch(() => {})}
        onContinue={() => mark("listen")}
      />
    );
  return <ExpressionsStep missionId={view.id} language={view.language} expressions={model.expressions} onDone={() => mark("expressions")} />;
}

function TaskStep({ view }: { view: MissionView }) {
  const copy = useCopy(MISSION_COPY);
  const modes = useModeInfo();
  return (
    <Intro title={copy.taskTitle(modes[view.situation].title)} meta={`${copy.minutes(STEP_MINUTES.task)} · ${copy.taskBody}`}>
      <Button block asChild>
        <Link to={missionSessionPath(view.situation, view.id)}>{view.sessionId ? copy.continue : copy.start}</Link>
      </Button>
    </Intro>
  );
}

/** Step 4. Skipping leaves the mission for now: the step stays open for later today. */
function FasterStep({ sessionId, onView }: { sessionId: string; onView: (view: MissionView) => void }) {
  const api = useApi();
  const copy = useCopy(MISSION_COPY);
  const navigate = useNavigate();
  const finished = () =>
    api.missionToday().then(
      (view) => (view.steps.faster ? onView(view) : navigate("/")),
      () => navigate("/"),
    );
  return (
    <>
      <h1 className="m-0 text-title">{copy.fasterTitle}</h1>
      <FasterRun sessionId={sessionId} onDone={() => void finished()} />
    </>
  );
}

/**
 * Step 5: step 3's takeaways first, then what is due, a few at most. With nothing to review, the step is done.
 * Closing before the last one leaves the mission for now.
 */
function ReviewStep({ view, onDone }: { view: MissionView; onDone: () => void }) {
  const api = useApi();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<ReviewSubject[] | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let active = true;
    const takeaways: ReviewSubject[] = loadMissionTakeaways(view.id).map((id) => ({ kind: "pattern", id }));
    api
      .reviewOverview(view.language)
      .then(
        (overview) => overview.due.map((item) => item.subject),
        () => [] as ReviewSubject[],
      )
      .then((due) => {
        if (!active) return;
        const seen = new Set(takeaways.map((s) => `${s.kind}-${s.id}`));
        const all = [...takeaways, ...due.filter((s) => !seen.has(`${s.kind}-${s.id}`))].slice(0, REVIEW_LIMIT);
        if (all.length === 0) done.current();
        else setSubjects(all);
      });
    return () => {
      active = false;
    };
  }, [api, view.id, view.language]);

  if (!subjects) return <Busy />;
  // Done once every item was answered; closing earlier keeps the step open for later today.
  return <ReviewRun subjects={subjects} onDone={(results) => (results.length === subjects.length ? onDone() : navigate("/"))} />;
}

function MissionDone({ view }: { view: MissionView }) {
  const copy = useCopy(MISSION_COPY);
  const modes = useModeInfo();
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <VoiceBall state="success" size={150} />
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-label text-apricot-ink">{copy.doneLabel}</span>
          <h1 className="m-0 text-display">{copy.doneTitle}</h1>
          <span className="text-caption text-taupe">{copy.doneBody(modes[view.situation].title)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button block asChild>
          <Link to="/" replace>
            {copy.backToToday}
          </Link>
        </Button>
        <Button block variant="ghost" asChild>
          <Link to={TALK_PATH}>{copy.talkMore}</Link>
        </Button>
      </div>
    </>
  );
}

/** A step that starts on another screen: its title, time and one button. */
function Intro({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <VoiceBall state="idle" size={150} />
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="m-0 text-display">{title}</h1>
          <span className="text-caption text-taupe">{meta}</span>
        </div>
      </div>
      {children}
    </>
  );
}
