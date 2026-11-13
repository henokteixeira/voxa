import { useEffect, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { type Copy, useCopy } from "@/lib/i18n/locale";

const COPY: Copy<{ label: string }> = {
  en: { label: "Today's expressions" },
  "pt-BR": { label: "Expressões de hoje" },
};

/**
 * In the daily mission's conversation, the 3 expressions the learner just took stay on screen as a crib sheet
 * (decided on 2026-11-13: keeping the model in mind was too much). Nothing shows when they can't be loaded.
 */
export function MissionExpressions({ missionId }: { missionId: string }) {
  const api = useApi();
  const copy = useCopy(COPY);
  const [phrases, setPhrases] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    api
      .missionModel(missionId)
      .then((model) => active && setPhrases(model.expressions.map((e) => e.phrase)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, missionId]);
  if (!phrases.length) return null;
  return (
    <ul aria-label={copy.label} className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0">
      {phrases.map((phrase) => (
        <li key={phrase} lang="en" className="rounded-pill bg-paper px-2.5 py-1 font-serif text-[14px] text-ink-soft shadow-card">
          {phrase}
        </li>
      ))}
    </ul>
  );
}
