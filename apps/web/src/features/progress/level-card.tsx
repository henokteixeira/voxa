import { useId, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { VoiceBall } from "@/components/voice-ball";
import { CEFR_LEVELS, type CefrLevel, type LevelView, type StepChangeProposal } from "@/lib/api";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { LEVEL_COPY } from "./level-copy";

export const PLACEMENT_PATH = "/session/placement";
/** What the tutor noticed: the evidence behind the level, and ways to change it. */
export const LEVEL_PATH = "/progress/level";

/** The speaking level on the Progress tab: the estimate on the CEFR scale, how much help it gives, and "Why A2?". */
export function LevelCard({ view, onSet }: { view: LevelView; onSet: (level: CefrLevel) => Promise<void> }) {
  const copy = useCopy(LEVEL_COPY);
  const { locale } = useLocale();
  const titleId = useId();
  const [changing, setChanging] = useState(false);
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
        <Button variant="ghost" block onClick={() => setChanging(true)}>
          {copy.setByHand}
        </Button>
        {changing && <LevelSheet current={null} onSet={onSet} onClose={() => setChanging(false)} />}
      </Card>
    );
  }

  const date = new Date(current.assessedAt).toLocaleDateString(locale, { day: "numeric", month: "short" });
  return (
    <>
      <Card role="region" aria-labelledby={titleId} className="gap-3">
        <h2 id={titleId} className="m-0 text-label text-taupe">
          {copy.estimateLabel}
        </h2>
        <span className="font-serif text-[40px] leading-none">{current.level}</span>
        <LevelScale level={current.level} label={copy.levelOf(current.level)} />
        <span className="text-caption text-taupe">
          {copy.help[current.level]} · {copy.source(current.source, date)}
        </span>
        {placementDue && <p className="m-0 text-caption text-honey-ink">{copy.placementDue}</p>}
      </Card>
      <Link
        to={LEVEL_PATH}
        className="flex min-h-[52px] items-center justify-between gap-3 rounded-md bg-paper px-5 text-body-strong text-ink no-underline shadow-card"
      >
        {copy.why(current.level)}
        <ChevronIcon />
      </Link>
    </>
  );
}

/** The CEFR levels as a row, the learner's one filled. */
function LevelScale({ level, label }: { level: CefrLevel; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex gap-1.5">
      {CEFR_LEVELS.map((l) => (
        <span
          key={l}
          aria-hidden="true"
          className={cn(
            "flex-1 rounded-pill py-1 text-center text-[12px] font-bold transition-colors duration-300",
            l === level ? "bg-ink text-paper" : "bg-sand-soft text-taupe",
          )}
        >
          {l}
        </span>
      ))}
    </span>
  );
}

/** Change the level by hand: each level with how much help it gives. */
export function LevelSheet({
  current,
  onSet,
  onClose,
}: {
  current: CefrLevel | null;
  onSet: (level: CefrLevel) => Promise<void>;
  onClose: () => void;
}) {
  const copy = useCopy(LEVEL_COPY);
  const [choice, setChoice] = useState<CefrLevel>(current ?? CEFR_LEVELS[0]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const titleId = useId();
  return (
    <Sheet label={copy.sheetTitle} closeLabel={copy.back} onClose={onClose}>
      {(close) => (
        <>
          <h2 id={titleId} className="m-0 text-heading">
            {copy.sheetTitle}
          </h2>
          <div role="radiogroup" aria-labelledby={titleId} className="flex flex-col gap-2">
            {CEFR_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={choice === level}
                onClick={() => setChoice(level)}
                className={cn(
                  "vx-spring flex min-h-12 cursor-pointer items-center gap-2 rounded-pill border-none px-5 text-left font-sans text-body",
                  choice === level ? "bg-ink text-paper" : "bg-paper text-ink shadow-[inset_0_0_0_1.5px_var(--color-sand)]",
                )}
              >
                <b>{level}</b> · {copy.help[level]}
              </button>
            ))}
          </div>
          {failed && (
            <p role="alert" className="m-0 text-caption text-honey-ink">
              {copy.saveFailed}
            </p>
          )}
          <Button
            block
            disabled={saving}
            onClick={async () => {
              setFailed(false);
              setSaving(true);
              try {
                await onSet(choice);
                close();
              } catch {
                setFailed(true);
                setSaving(false);
              }
            }}
          >
            {copy.save}
          </Button>
        </>
      )}
    </Sheet>
  );
}

const DISMISSED_KEY = "voxa.stepChangeDismissed";

/** "Not yet" hides one proposal: after another session that still points the same way, it comes back. */
const proposalKey = (proposal: StepChangeProposal) => `${proposal.basedOn}:${proposal.direction}:${proposal.to}`;

function wasDismissed(key: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === key;
  } catch {
    return false;
  }
}

/** The step change the last sessions point to, as a sheet. The learner decides; "Not yet" hides it until the next session. */
export function StepChangeSheet({
  proposal,
  onConfirm,
}: {
  proposal: StepChangeProposal;
  onConfirm: (to: CefrLevel) => Promise<void>;
}) {
  const copy = useCopy(LEVEL_COPY).stepChange;
  const { saveFailed } = useCopy(LEVEL_COPY);
  const key = proposalKey(proposal);
  const [open, setOpen] = useState(() => !wasDismissed(key));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!open) return null;

  const title = copy.title(proposal.direction, proposal.to);
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, key);
    } catch {
      // Without storage the proposal simply comes back next time.
    }
    setOpen(false);
  };
  return (
    <Sheet label={title} onClose={dismiss}>
      {(close) => (
        <>
          <div className="self-center">
            <VoiceBall state="success" size={88} />
          </div>
          <h2 className="m-0 text-heading">{title}</h2>
          <p className="m-0 text-body text-ink-soft">{copy.body(proposal.direction)}</p>
          {failed && (
            <p role="alert" className="m-0 text-caption text-honey-ink">
              {saveFailed}
            </p>
          )}
          <Button
            block
            disabled={saving}
            onClick={async () => {
              setFailed(false);
              setSaving(true);
              try {
                await onConfirm(proposal.to);
                setOpen(false);
              } catch {
                setFailed(true);
                setSaving(false);
              }
            }}
          >
            {copy.confirm}
          </Button>
          <Button variant="ghost" block disabled={saving} onClick={close}>
            {copy.notNow}
          </Button>
        </>
      )}
    </Sheet>
  );
}

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

export function ChevronIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-taupe">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
