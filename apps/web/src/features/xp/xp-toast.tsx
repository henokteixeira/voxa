import { cn } from "@/lib/utils";

export type XpToastTone = "correction" | "goal";

const TONE_CLASS: Record<XpToastTone, string> = {
  correction: "bg-sage-soft text-sage-ink",
  goal: "bg-honey-soft text-honey-ink",
};

/** A quiet reward that rises and leaves on its own. One at a time, inside a live region the screen keeps mounted. */
export function XpToast({ xp, label, tone }: { xp: number; label: string; tone: XpToastTone }) {
  return (
    <div className={cn("vx-toast inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm", TONE_CLASS[tone])}>
      <b className="tabular-nums">+{xp} XP</b>
      <span>{label}</span>
    </div>
  );
}
