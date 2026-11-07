import { useEffect, useState } from "react";

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Today's XP against the daily goal. Fills from empty when it appears (only the colour with reduced motion). */
export function GoalRing({ value, goal, size = 92, label }: { value: number; goal: number; size?: number; label: string }) {
  const share = goal > 0 ? Math.min(value, goal) / goal : 0;
  // Starts empty, then fills on the next frame so the change animates.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(share));
    return () => cancelAnimationFrame(frame);
  }, [share]);
  const met = value >= goal;
  return (
    <div role="img" aria-label={label} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
        <circle cx={48} cy={48} r={RADIUS} fill="none" strokeWidth={8} className="stroke-sand-soft" />
        <circle
          cx={48}
          cy={48}
          r={RADIUS}
          fill="none"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - shown)}
          transform="rotate(-90 48 48)"
          className="stroke-sage-strong motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-out"
          opacity={shown === 0 ? 0 : 1}
        />
      </svg>
      <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-serif tabular-nums leading-none ${met ? "text-sage-ink" : ""}`} style={{ fontSize: size * 0.24 }}>
          {value}
        </span>
        <span className="text-[11px] text-taupe tabular-nums">/ {goal}</span>
      </span>
    </div>
  );
}
