import { useId, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CEFR_LEVELS, type CefrLevel, type LevelView } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { LEVEL_COPY } from "./level-copy";

export const PLACEMENT_PATH = "/session/placement";

/** The speaking level on the Progress tab: the estimate, the learner's own lines behind it, and ways to change it. */
export function LevelCard({ view, onSet }: { view: LevelView; onSet: (level: CefrLevel) => Promise<void> }) {
  const copy = useCopy(LEVEL_COPY);
  const { locale } = useLocale();
  const titleId = useId();
  const { current, placementDue } = view;

  if (!current) {
    return (
      <Card role="region" aria-labelledby={titleId} className="gap-3">
        <h2 id={titleId} className="m-0 text-body-strong">
          {copy.noLevelTitle}
        </h2>
        <p className="m-0 text-caption text-taupe">{copy.noLevelBody}</p>
        <Button block asChild>
          <Link to={PLACEMENT_PATH}>{copy.startPlacement}</Link>
        </Button>
        <AdjustLevel current={null} onSet={onSet} />
      </Card>
    );
  }

  const date = new Date(current.assessedAt).toLocaleDateString(locale, { day: "numeric", month: "short" });
  return (
    <Card role="region" aria-labelledby={titleId} className="gap-3">
      <h2 id={titleId} className="m-0 text-caption text-taupe">
        {copy.levelTitle}
      </h2>
      <span className="font-serif text-[32px] leading-none">{copy.levelOf(current.level)}</span>
      <span className="text-caption text-taupe">{copy.source(current.source, date)}</span>
      {current.evidence.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="m-0 text-label text-taupe">{copy.evidenceLabel}</h3>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {current.evidence.map((line) => (
              <li key={line} lang={current.language} className="rounded-md bg-sand-soft px-3 py-2 text-small">
                “{line}”
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="m-0 text-caption text-taupe">{copy.notAGrade}</p>
      {placementDue && <p className="m-0 text-caption text-honey-ink">{copy.placementDue}</p>}
      <AdjustLevel current={current.level} onSet={onSet} />
      <Button variant="ghost" block asChild>
        <Link to={PLACEMENT_PATH}>{copy.redoPlacement}</Link>
      </Button>
    </Card>
  );
}

/** Hand correction. Without a level yet (e.g. a placement where little was said), it starts from the lowest level. */
/** The level could not be read: say so, instead of looking like there is no level. */
export function LevelUnavailable({ onRetry }: { onRetry: () => void }) {
  const copy = useCopy(LEVEL_COPY);
  return (
    <Card role="region" aria-label={copy.levelTitle} className="gap-3">
      <span className="text-body-strong">{copy.unavailableTitle}</span>
      <span className="text-caption text-taupe">{copy.unavailableBody}</span>
      <Button variant="ghost" block onClick={onRetry}>
        {copy.tryAgain}
      </Button>
    </Card>
  );
}

function AdjustLevel({ current, onSet }: { current: CefrLevel | null; onSet: (level: CefrLevel) => Promise<void> }) {
  const copy = useCopy(LEVEL_COPY);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<CefrLevel>(current ?? CEFR_LEVELS[0]);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectId = useId();

  if (!open) {
    return (
      <Button variant="ghost" block onClick={() => setOpen(true)}>
        {current ? copy.adjust : copy.setByHand}
      </Button>
    );
  }
  const save = async () => {
    setFailed(false);
    setSaving(true);
    try {
      await onSet(choice);
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className="text-label text-taupe">
        {copy.adjustLabel}
      </label>
      <select
        id={selectId}
        value={choice}
        onChange={(e) => setChoice(e.target.value as CefrLevel)}
        className="min-h-11 rounded-md border-none bg-sand-soft px-3 text-body text-ink"
      >
        {CEFR_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
      {failed && (
        <p role="alert" className="m-0 text-caption text-honey-ink">
          {copy.saveFailed}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" block disabled={saving} onClick={() => setOpen(false)}>
          {copy.cancel}
        </Button>
        <Button block disabled={saving} onClick={save}>
          {copy.save}
        </Button>
      </div>
    </div>
  );
}
