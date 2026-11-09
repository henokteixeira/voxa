import { CheckInHistory } from "@/features/check-in/check-in-history";
import { useCopy, type Copy } from "@/lib/i18n/locale";
import { LevelCard, LevelUnavailable, StepChangeSheet } from "./level-card";
import { SignalsHistory } from "./signals-history";
import { proposalKey, useLevel } from "./use-level";

const COPY: Copy<{ title: string }> = {
  en: { title: "Progress" },
  "pt-BR": { title: "Progresso" },
};

export function ProgressPage() {
  const copy = useCopy(COPY);
  const level = useLevel();
  return (
    <>
      <h1 className="m-0 text-title">{copy.title}</h1>
      {/* The check-in comes first: it answers "am I learning?" most directly. */}
      <CheckInHistory />
      {level.view === null ? (
        <LevelUnavailable onRetry={level.reload} />
      ) : (
        level.view && (
          <>
            <LevelCard view={level.view} onSet={level.set} />
            {level.view.proposal && (
              <StepChangeSheet
                key={proposalKey(level.view.proposal)}
                proposal={level.view.proposal}
                onConfirm={level.confirm}
              />
            )}
          </>
        )
      )}
      <SignalsHistory />
    </>
  );
}
