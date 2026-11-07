import { useCopy, type Copy } from "@/lib/i18n/locale";
import { LevelCard, LevelUnavailable } from "./level-card";
import { SignalsHistory } from "./signals-history";
import { useLevel } from "./use-level";

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
      {level.view === null ? (
        <LevelUnavailable onRetry={level.reload} />
      ) : (
        level.view && <LevelCard view={level.view} onSet={level.set} onConfirm={level.confirm} />
      )}
      <SignalsHistory />
    </>
  );
}
