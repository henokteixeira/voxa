import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BackIcon, IconButton } from "@/features/session/session-parts";
import { CEFR_LEVELS } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { LEVEL_COPY } from "./level-copy";
import { LevelSheet, LevelUnavailable, PLACEMENT_PATH } from "./level-card";
import { useLevel } from "./use-level";

/** "Why A2?": the learner's own lines behind the level, what comes next, and ways to change it. */
export function LevelPage() {
  const copy = useCopy(LEVEL_COPY);
  const navigate = useNavigate();
  const level = useLevel();
  const [changing, setChanging] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  // A pushed screen: its title takes the focus once it shows, so it is announced.
  const ready = Boolean(level.view?.current);
  useEffect(() => {
    if (ready) title.current?.focus();
  }, [ready]);

  const header = (
    <div className="flex min-h-11 items-center">
      <IconButton label={copy.back} onClick={() => navigate("/progress")}>
        <BackIcon />
      </IconButton>
    </div>
  );
  if (level.view === undefined) return header;
  if (level.view === null) {
    return (
      <>
        {header}
        <LevelUnavailable onRetry={level.reload} />
      </>
    );
  }
  const { current } = level.view;
  // Without a level there is nothing to explain: Progress offers the level chat.
  if (!current) return <Navigate to="/progress" replace />;

  const next = CEFR_LEVELS[CEFR_LEVELS.indexOf(current.level) + 1];
  return (
    <div className="vx-page-in flex flex-col gap-5">
      {header}
      <h1 ref={title} tabIndex={-1} className="m-0 text-title outline-none">
        {copy.noticedTitle}
      </h1>
      <Card>
        <h2 className="m-0 text-label text-sage-ink">{copy.youCan}</h2>
        {current.evidence.map((line) => (
          <blockquote
            key={line}
            lang={current.language}
            className="m-0 pl-3 font-serif text-[17px] leading-snug shadow-[inset_2px_0_0_var(--color-sand)] [font-variation-settings:'SOFT'_60]"
          >
            “{line}”
          </blockquote>
        ))}
        <p className="m-0 text-caption text-taupe">{copy.canDo[current.level]}</p>
      </Card>
      {next && (
        <Card>
          <h2 className="m-0 text-label text-honey-ink">{copy.nextStep(next)}</h2>
          <p className="m-0 text-caption text-taupe">{copy.canDo[next]}</p>
        </Card>
      )}
      <p className="m-0 text-caption text-taupe">{copy.notAGrade}</p>
      <div className="flex flex-col gap-2 pt-2">
        <Button variant="secondary" block asChild>
          <Link to={PLACEMENT_PATH}>{copy.redoPlacement}</Link>
        </Button>
        <Button variant="ghost" block onClick={() => setChanging(true)}>
          {copy.changeLevel}
        </Button>
      </div>
      {changing && <LevelSheet current={current.level} onSet={level.set} onClose={() => setChanging(false)} />}
    </div>
  );
}
