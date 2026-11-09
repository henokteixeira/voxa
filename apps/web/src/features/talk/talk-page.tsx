import { useId } from "react";
import { Link } from "react-router";
import { useModeInfo } from "@/features/session/modes";
import { EVERYDAY_MODES, type Mode, WORK_MODES } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { TALK_COPY } from "./talk-copy";

export const TALK_PATH = "/talk";

/** One group of conversations, as a 2-column grid; each tile starts that session. */
function ConversationGroup({ title, list }: { title: string; list: readonly Mode[] }) {
  const id = useId();
  const modes = useModeInfo();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="m-0 text-label text-taupe">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        {list.map((mode) => (
          <Link
            key={mode}
            to={`/session/${mode}`}
            className="flex min-h-[68px] flex-col justify-center gap-0.5 rounded-md bg-paper px-3.5 py-3 text-ink no-underline shadow-card transition-[transform,background-color] duration-150 hover:bg-sand-soft motion-safe:active:scale-[0.98]"
          >
            <b className="text-small leading-tight">{modes[mode].title}</b>
            <span className="text-caption text-taupe">{modes[mode].length}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Talk: the free conversations, outside the daily mission. The learner always picks; nothing is chosen for them. */
export function TalkPage() {
  const copy = useCopy(TALK_COPY);
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-title">{copy.title}</h1>
        <p className="m-0 text-caption text-taupe">{copy.intro}</p>
      </div>
      <nav aria-label={copy.categories} className="flex flex-col gap-5">
        <ConversationGroup title={copy.everyday} list={EVERYDAY_MODES} />
        <ConversationGroup title={copy.work} list={WORK_MODES} />
      </nav>
    </>
  );
}
