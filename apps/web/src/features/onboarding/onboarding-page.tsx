import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import { PLACEMENT_PATH } from "@/features/progress/level-card";
import { SESSION_COPY } from "@/features/session/session-copy";
import { BackIcon, IconButton } from "@/features/session/session-parts";
import { useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { ONBOARDING_COPY } from "./onboarding-copy";
import { markOnboardingSeen } from "./onboarding-seen";
import { type MicCheck, useMicCheck } from "./use-mic-check";

/** First run: the welcome and microphone check that lead to the level chat. */
export const ONBOARDING_PATH = "/onboarding";

/** Steps after the welcome screen, shown as dots. */
const STEPS = 2;

/** With the microphone open and nothing heard for this long, offer a way forward. */
export const NOT_HEARING_MS = 10_000;

/** First run: welcome, a working microphone, then what the level chat is like. One action per screen. */
export function OnboardingPage() {
  const copy = useCopy(ONBOARDING_COPY);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  if (step === 0) {
    return (
      <Screen
        key="welcome"
        title={copy.welcome.title}
        display
        header={
          <div className="flex flex-1 items-end justify-center">
            <VoiceBall state="idle" size={200} />
          </div>
        }
      >
        <p className="m-0 -mt-3 flex-1 text-body text-ink-soft">{copy.welcome.body}</p>
        <Button block onClick={() => setStep(1)}>
          {copy.welcome.action}
        </Button>
      </Screen>
    );
  }

  const header = (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <IconButton label={copy.back} onClick={() => setStep(step - 1)}>
        <BackIcon />
      </IconButton>
      <StepDots step={step} label={copy.stepOf(step, STEPS)} />
      <span className="size-11" aria-hidden="true" />
    </div>
  );

  // The microphone step is its own component: leaving it (Back, Continue) closes the microphone.
  if (step === 1) return <MicStep key="mic" header={header} onDone={() => setStep(2)} />;

  return (
    <Screen key="chat" title={copy.chat.title} header={header}>
      <p className="m-0 -mt-4 text-caption text-taupe">{copy.chat.body}</p>
      <ul className="m-0 flex list-none flex-col gap-4 rounded-lg bg-paper p-5 shadow-card">
        {copy.chat.points.map((point, index) => (
          <li
            key={point}
            className="vx-page-in flex items-start gap-3 text-body"
            style={{ animationDelay: `${120 * index}ms` }}
          >
            <CheckIcon />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-2">
        <Button
          block
          onClick={() => {
            markOnboardingSeen();
            navigate(PLACEMENT_PATH);
          }}
        >
          {copy.chat.action}
        </Button>
        <Button
          variant="ghost"
          block
          onClick={() => {
            markOnboardingSeen();
            navigate("/");
          }}
        >
          {copy.chat.later}
        </Button>
      </div>
    </Screen>
  );
}

function MicStep({ header, onDone }: { header: ReactNode; onDone: () => void }) {
  const copy = useCopy(ONBOARDING_COPY).mic;
  const { check, start, unlock } = useMicCheck();
  const notHearing = useNotHearing(check);
  const action = useRef<HTMLButtonElement>(null);
  // The action that appears after a result gets the focus, so keyboard and screen reader users land on it.
  useEffect(() => {
    if (check.status === "heard" || check.status === "failed") action.current?.focus();
  }, [check.status]);

  let button: ReactNode = null;
  if (check.status === "heard") {
    button = (
      <Button ref={action} block onClick={onDone}>
        {copy.action}
      </Button>
    );
  } else if (check.status === "idle") {
    button = (
      <Button block onClick={() => void start()}>
        {copy.start}
      </Button>
    );
  } else if (check.status === "failed" || notHearing) {
    button = (
      <Button ref={action} block variant={notHearing ? "secondary" : "primary"} onClick={() => void start()}>
        {copy.tryAgain}
      </Button>
    );
  }

  return (
    <Screen title={copy.title} header={header} centered onPointerDown={unlock}>
      <p lang="en" className="m-0 -mt-4 text-center font-serif text-[22px] leading-snug [font-variation-settings:'SOFT'_60]">
        {copy.phrase}
      </p>
      <MicStage check={check} notHearing={notHearing} />
      {button}
    </Screen>
  );
}

/** True once the microphone has been open this long without hearing anything. */
function useNotHearing(check: MicCheck): boolean {
  // The check that ran out of time; any newer check (a voice, a retry) is a new object, so it is no longer late.
  const [lateCheck, setLateCheck] = useState<MicCheck | null>(null);
  useEffect(() => {
    if (check.status !== "listening") return;
    const timer = setTimeout(() => setLateCheck(check), NOT_HEARING_MS);
    return () => clearTimeout(timer);
  }, [check]);
  return lateCheck === check;
}

function MicStage({ check, notHearing }: { check: MicCheck; notHearing: boolean }) {
  const copy = useCopy(ONBOARDING_COPY).mic;
  const { failure } = useCopy(SESSION_COPY);
  if (check.status === "failed") {
    const problem = failure[`mic_${check.reason}`];
    return (
      <section role="alert" className="flex flex-col gap-2 rounded-lg bg-paper p-5 shadow-card">
        <h2 className="m-0 text-heading">{problem.title}</h2>
        <p className="m-0 text-small text-ink-soft">{problem.body}</p>
        {problem.steps && (
          <ol className="m-0 flex flex-col gap-1.5 pl-5 text-small">
            {problem.steps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        )}
      </section>
    );
  }
  const live = check.status === "listening" || check.status === "hearing";
  const line = check.status === "heard" ? copy.heard : notHearing ? copy.notHearing : live ? copy.listening : "";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <VoiceBall state={check.status === "heard" ? "success" : live ? "listening" : "idle"} size={180} />
      <p
        role="status"
        className={cn("m-0 min-h-6 max-w-[320px] text-body-strong", check.status === "heard" ? "text-sage-ink" : "text-mist-ink")}
      >
        {line}
      </p>
    </div>
  );
}

function StepDots({ step, label }: { step: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex gap-1.5">
      {Array.from({ length: STEPS }, (_, index) => (
        <i
          key={index}
          className={cn("h-1.5 w-[22px] rounded-full transition-colors duration-200", index < step ? "bg-ink" : "bg-sand")}
        />
      ))}
    </span>
  );
}

/** One onboarding screen. Its title takes the focus when it appears, so a new step is announced. */
function Screen(props: {
  title: string;
  header?: ReactNode;
  display?: boolean;
  /** Title and text centered (the display style is always centered). */
  centered?: boolean;
  onPointerDown?: () => void;
  children: ReactNode;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  return (
    <main
      onPointerDown={props.onPointerDown}
      className={cn(
        "vx-page-in mx-auto flex h-dvh w-full max-w-[480px] flex-col gap-6 overflow-y-auto overscroll-contain px-5 pt-7 pb-[max(32px,env(safe-area-inset-bottom))]",
        props.display && "text-center",
      )}
    >
      {props.header}
      <h1
        ref={title}
        tabIndex={-1}
        className={cn("m-0 outline-none", props.display ? "text-display" : "text-title", props.centered && "text-center")}
      >
        {props.title}
      </h1>
      {props.children}
    </main>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="mt-0.5 size-5 shrink-0"
      fill="none"
      stroke="var(--color-sage-ink)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
