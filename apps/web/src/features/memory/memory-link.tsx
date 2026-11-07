import { Link } from "react-router";
import { useCopy } from "@/lib/i18n/locale";
import { MEMORY_COPY } from "./memory-copy";
import { MEMORY_PATH } from "./memory-page";

/** The Settings row that opens "What Voxa knows about you". */
export function MemoryLink() {
  const copy = useCopy(MEMORY_COPY);
  return (
    <Link
      to={MEMORY_PATH}
      className="flex min-h-14 flex-col gap-0.5 rounded-md bg-paper px-5 py-4 text-ink no-underline shadow-card transition-[transform,background-color] duration-150 hover:bg-sand-soft motion-safe:active:scale-[0.98]"
    >
      <b className="text-body-strong">{copy.settingsLink}</b>
      <span className="text-caption text-taupe">{copy.settingsHint}</span>
    </Link>
  );
}
