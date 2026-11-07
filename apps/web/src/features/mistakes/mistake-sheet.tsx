import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useApi } from "@/hooks/use-api";
import { type BankMistake, type DismissReason, NEW_WORD_CATEGORY } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCopy, useLocale } from "@/lib/i18n/locale";
import { categoryLabel, originalProps, STATUS_CHIP_LABEL } from "./format";
import { MISTAKES_COPY } from "./mistakes-copy";

const REASONS: DismissReason[] = ["transcript_error", "both_correct", "not_needed"];

const STATUS_CHIP = {
  open: "bg-sand-soft text-ink-soft",
  improving: "bg-honey-soft text-honey-ink",
  mastered: "bg-sage-soft text-sage-ink",
} as const;

/** One mistake, and the way to say it isn't one: its accessible name and its content. */
function useMistakeDetail(mistake: BankMistake, onDismissed: (id: string) => void): { label: string; content: ReactNode } {
  const api = useApi();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<DismissReason | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const copy = useCopy(MISTAKES_COPY);
  const statusLabel = useCopy(STATUS_CHIP_LABEL);
  const { locale } = useLocale();
  const newWord = mistake.category === NEW_WORD_CATEGORY;

  async function remove() {
    if (!reason) return;
    setState("saving");
    try {
      await api.dismissMistake(mistake.id, reason);
      onDismissed(mistake.id);
    } catch {
      setState("failed");
    }
  }

  const label = asking ? copy.whyNot : newWord ? categoryLabel(mistake.category, locale) : copy.mistake;
  const content = asking ? (
    <>
      <h2 className="m-0 font-serif text-2xl font-normal">{copy.whyNot}</h2>
      {REASONS.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={reason === r}
          onClick={() => setReason(r)}
          className={cn(
            "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-md border-none bg-paper px-4 py-3.5 text-left font-sans text-[15px] font-semibold text-ink shadow-card",
            reason === r && "shadow-[inset_0_0_0_2px_var(--color-ink)]",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-5 shrink-0 rounded-full",
              reason === r ? "shadow-[inset_0_0_0_6px_var(--color-ink)]" : "shadow-[inset_0_0_0_2px_var(--color-sand)]",
            )}
          />
          {copy.reasons[r]}
        </button>
      ))}
      <span className="text-caption text-taupe">{copy.leavesBank}</span>
      {state === "failed" && (
        <span role="alert" className="text-caption font-semibold text-apricot-ink">
          {copy.removeFailed}
        </span>
      )}
      <Button block disabled={!reason || state === "saving"} onClick={remove}>
        {copy.remove}
      </Button>
    </>
  ) : (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-honey-ink">{categoryLabel(mistake.category, locale)}</span>
        <span className={cn("rounded-pill px-2.5 py-1 text-xs font-bold", STATUS_CHIP[mistake.status])}>
          {statusLabel[mistake.status]}
        </span>
      </div>
      <span {...originalProps(mistake.category)}>
        {mistake.original}
      </span>
      <span lang="en" className="font-serif text-2xl leading-[1.3]">
        {mistake.correction}
      </span>
      <span className="text-caption text-taupe">{copy.timesSoFar(mistake.occurrences)}</span>
      {!newWord && (
        <Button block variant="ghost" onClick={() => setAsking(true)}>
          {copy.notAMistake}
        </Button>
      )}
    </>
  );
  return { label, content };
}

/** Phones: the mistake in a bottom sheet. */
export function MistakeSheet({
  mistake,
  onClose,
  onDismissed,
}: {
  mistake: BankMistake;
  onClose: () => void;
  onDismissed: (id: string) => void;
}) {
  const copy = useCopy(MISTAKES_COPY);
  const { label, content } = useMistakeDetail(mistake, onDismissed);
  return (
    <Sheet label={label} closeLabel={copy.close} onClose={onClose}>
      {content}
    </Sheet>
  );
}

/** Wide screens: the mistake beside the list (key it by id so each mistake starts fresh). */
export function MistakePanel({ mistake, onDismissed }: { mistake: BankMistake; onDismissed: (id: string) => void }) {
  const { label, content } = useMistakeDetail(mistake, onDismissed);
  return (
    <section aria-label={label} className="vx-page-in flex flex-col gap-3 rounded-lg bg-paper p-6 shadow-card">
      {content}
    </section>
  );
}
