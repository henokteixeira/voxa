import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import type { BankMistake, DismissReason } from "@/lib/api";
import { cn } from "@/lib/utils";
import { categoryLabel, STATUS_LABEL } from "./format";

const REASONS: { id: DismissReason; label: string }[] = [
  { id: "transcript_error", label: "I said it right; the transcript is wrong" },
  { id: "both_correct", label: "Both ways are correct" },
  { id: "not_needed", label: "I don't need this one" },
];

const STATUS_CHIP = {
  open: "bg-sand-soft text-ink-soft",
  improving: "bg-honey-soft text-honey-ink",
  mastered: "bg-sage-soft text-sage-ink",
} as const;

/** Bottom sheet: one mistake, and the way to say it isn't one. */
export function MistakeSheet({
  mistake,
  onClose,
  onDismissed,
}: {
  mistake: BankMistake;
  onClose: () => void;
  onDismissed: (id: string) => void;
}) {
  const api = useApi();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<DismissReason | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-[rgba(46,37,32,0.32)]">
      <button type="button" aria-label="Close" className="flex-1 cursor-pointer border-none bg-transparent" onClick={onClose} />
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={asking ? "Why isn't it a mistake?" : "Mistake"}
        className="mx-auto flex w-full max-w-[480px] flex-col gap-3 rounded-t-[28px] bg-linen px-5 pt-3 pb-8 outline-none"
      >
        <span className="h-[5px] w-10 self-center rounded-[3px] bg-sand" aria-hidden="true" />
        {asking ? (
          <>
            <h2 className="m-0 font-serif text-2xl font-normal">Why isn't it a mistake?</h2>
            {REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={reason === r.id}
                onClick={() => setReason(r.id)}
                className={cn(
                  "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-md border-none bg-paper px-4 py-3.5 text-left font-sans text-[15px] font-semibold text-ink shadow-card",
                  reason === r.id && "shadow-[inset_0_0_0_2px_var(--color-ink)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-5 shrink-0 rounded-full",
                    reason === r.id ? "shadow-[inset_0_0_0_6px_var(--color-ink)]" : "shadow-[inset_0_0_0_2px_var(--color-sand)]",
                  )}
                />
                {r.label}
              </button>
            ))}
            <span className="text-caption text-taupe">It leaves the bank and won't count again.</span>
            {state === "failed" && (
              <span role="alert" className="text-caption font-semibold text-apricot-ink">
                Couldn't remove it. Try again.
              </span>
            )}
            <Button block disabled={!reason || state === "saving"} onClick={remove}>
              Remove from bank
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-label text-honey-ink">{categoryLabel(mistake.category)}</span>
              <span className={cn("rounded-pill px-2.5 py-1 text-xs font-bold", STATUS_CHIP[mistake.status])}>
                {STATUS_LABEL[mistake.status]}
              </span>
            </div>
            <span className="text-[15px] text-taupe line-through">{mistake.original}</span>
            <span className="font-serif text-2xl leading-[1.3]">{mistake.correction}</span>
            <span className="text-caption text-taupe">
              {mistake.occurrences === 1 ? "Once" : `${mistake.occurrences} times`} so far
            </span>
            <Button block variant="ghost" onClick={() => setAsking(true)}>
              This isn't a mistake
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
