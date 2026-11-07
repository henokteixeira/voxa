import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { VoiceBall } from "@/components/voice-ball";
import { PLACEMENT_PATH } from "@/features/progress/level-card";
import { SESSION_COPY } from "@/features/session/session-copy";
import { BackIcon, IconButton } from "@/features/session/session-parts";
import { useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { ONBOARDING_COPY } from "./onboarding-copy";
import { type MicCheck, useMicCheck } from "./use-mic-check";

/** First run: the welcome and microphone check that lead to the level chat. */
export const ONBOARDING_PATH = "/onboarding";

/** Steps after the welcome screen, shown as dots. */
const STEPS = 2;

/** First run: welcome, a working microphone, then what the level chat is like. One action per screen. */
export function OnboardingPage() {
  const copy = useCopy(ONBOARDING_COPY);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const { check, start } = useMicCheck();

  if (step === 0) {
    return (
      <Screen key="welcome">
        <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <VoiceBall state="idle" size={200} />
          <div className="flex flex-col gap-3">
            <h1 className="m-0 text-display">{copy.welcome.title}</h1>
            <p className="m-0 text-body text-ink-soft">{copy.welcome.body}</p>
          </div>
        </div>
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

  if (step === 1) {
    return (
      <Screen key="mic">
        {header}
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-title">{copy.mic.title}</h1>
          <p lang="en" className="m-0 font-serif text-[22px] leading-snug [font-variation-settings:'SOFT'_60]">
            {copy.mic.phrase}
          </p>
        </div>
        <MicStage check={check} />
        {check.status === "heard" ? (
          <Button block onClick={() => setStep(2)}>
            {copy.mic.action}
          </Button>
        ) : check.status === "idle" ? (
          <Button block onClick={() => void start()}>
            {copy.mic.start}
          </Button>
        ) : check.status === "failed" ? (
          <Button block onClick={() => void start()}>
            {copy.mic.tryAgain}
          </Button>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen key="chat">
      {header}
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-title">{copy.chat.title}</h1>
        <p className="m-0 text-caption text-taupe">{copy.chat.body}</p>
      </div>
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
        <Button block onClick={() => navigate(PLACEMENT_PATH)}>
          {copy.chat.action}
        </Button>
        <Button variant="ghost" block onClick={() => navigate("/")}>
          {copy.chat.later}
        </Button>
      </div>
    </Screen>
  );
}

function MicStage({ check }: { check: MicCheck }) {
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
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <VoiceBall state={check.status === "heard" ? "success" : live ? "listening" : "idle"} size={180} />
      <p role="status" className={cn("m-0 min-h-6 text-body-strong", check.status === "heard" ? "text-sage-ink" : "text-mist-ink")}>
        {check.status === "heard" ? copy.heard : live ? copy.listening : ""}
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

function Screen({ children }: { children: ReactNode }) {
  return (
    <main
      className="vx-page-in mx-auto flex h-dvh w-full max-w-[480px] flex-col gap-6 overflow-y-auto overscroll-contain px-5 pt-7 pb-[max(32px,env(safe-area-inset-bottom))]"
    >
      {children}
    </main>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" fill="none" stroke="var(--color-sage-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
