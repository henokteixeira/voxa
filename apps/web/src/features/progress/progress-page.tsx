import { Card } from "@/components/ui/card";
import { type Copy, useCopy } from "@/lib/i18n/locale";
import { LevelCard } from "./level-card";
import { useLevel } from "./use-level";

const COPY: Copy<{ title: string; emptyTitle: string; emptyBody: string }> = {
  en: {
    title: "Progress",
    emptyTitle: "Nothing to show yet",
    emptyBody: "Your fluency signals appear after a few sessions. Progress comes from practice: every session counts, mistakes included.",
  },
  "pt-BR": {
    title: "Progresso",
    emptyTitle: "Nada para mostrar ainda",
    emptyBody:
      "Seus sinais de fluência aparecem depois de algumas sessões. O progresso vem da prática: toda sessão conta, com erros e tudo.",
  },
};

export function ProgressPage() {
  const copy = useCopy(COPY);
  const level = useLevel();
  return (
    <>
      <h1 className="m-0 text-title">{copy.title}</h1>
      {level.view && <LevelCard view={level.view} onSet={level.set} />}
      <Card>
        <span className="text-body-strong">{copy.emptyTitle}</span>
        <span className="text-caption text-taupe">{copy.emptyBody}</span>
      </Card>
    </>
  );
}
