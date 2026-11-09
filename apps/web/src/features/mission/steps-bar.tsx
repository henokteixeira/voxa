import { cn } from "@/lib/utils";
import { MISSION_STEPS } from "./mission-steps";

/** The 5 steps as short bars: done in sage, the current one in ink (none before step 1). */
export function StepsBar({ now, className }: { now: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex gap-1.5", className)}>
      {MISSION_STEPS.map((step, i) => (
        <i key={step} className={cn("h-1 flex-1 rounded-pill", i < now ? "bg-sage-strong" : i === now ? "bg-ink" : "bg-sand")} />
      ))}
    </div>
  );
}
