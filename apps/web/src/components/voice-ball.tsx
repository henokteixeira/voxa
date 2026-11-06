import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

import { BALL_COLOR, type BallState, STATE_LABEL } from "./voice-ball-state";

export type { BallState };

interface FaceShape {
  browLeft: string;
  browRight: string;
  mouth: string;
  mouthFill: string;
  eyeRy: number;
  dx: number;
  dy: number;
}

const FACE: Record<BallState, FaceShape> = {
  idle: { browLeft: "M32 34 q6 -3 12 0", browRight: "M56 34 q6 -3 12 0", mouth: "M43 60 q7 5 14 0", mouthFill: "none", eyeRy: 5.6, dx: 0, dy: 0 },
  listening: { browLeft: "M32 29 q6 -5 12 -1", browRight: "M56 28 q6 -4 12 1", mouth: "M47 61 a3 3.6 0 1 0 6 0 a3 3.6 0 1 0 -6 0", mouthFill: "currentColor", eyeRy: 6.6, dx: -3, dy: 0 },
  thinking: { browLeft: "M32 35 q6 -1 12 0", browRight: "M56 28 q6 -5 12 1", mouth: "M44 62 q5 -2 12 0", mouthFill: "none", eyeRy: 5.2, dx: 4, dy: -4 },
  speaking: { browLeft: "M32 32 q6 -4 12 0", browRight: "M56 32 q6 -4 12 0", mouth: "M42 57 q8 0 16 0 q-1 10 -8 10 q-7 0 -8 -10z", mouthFill: "currentColor", eyeRy: 5.6, dx: 0, dy: 0 },
  hint: { browLeft: "M33 33 l10 1.5", browRight: "M56 29 q6 -5 12 0", mouth: "M42 61 q3 -3 5.3 0 q2.7 3 5.3 0 q2.7 -3 5.3 0", mouthFill: "none", eyeRy: 5.4, dx: 0, dy: 1 },
  success: { browLeft: "M32 30 q6 -5 12 0", browRight: "M56 30 q6 -5 12 0", mouth: "M40 56 q10 0 20 0 q-2 13 -10 13 q-8 0 -10 -13z", mouthFill: "currentColor", eyeRy: 5.6, dx: 0, dy: 0 },
};

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" } as const;

function Face({ state }: { state: BallState }) {
  const f = FACE[state];
  const blush = state === "success" || state === "listening";
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 size-full overflow-visible text-ink">
      <g transform={`translate(${f.dx} ${f.dy})`}>
        {state === "success" ? (
          <>
            <path d="M33 46 q5 -7 10 0" {...stroke} strokeWidth={3.2} />
            <path d="M57 46 q5 -7 10 0" {...stroke} strokeWidth={3.2} />
          </>
        ) : (
          <g className="vx-blink">
            <ellipse cx={38} cy={45} rx={4.6} ry={f.eyeRy} fill="currentColor" />
            <ellipse cx={62} cy={45} rx={4.6} ry={f.eyeRy} fill="currentColor" />
          </g>
        )}
        <path d={f.browLeft} {...stroke} />
        <path d={f.browRight} {...stroke} />
      </g>
      {blush && (
        <>
          <ellipse cx={29} cy={58} rx={6} ry={3.5} fill="#E07A8F" opacity={0.35} />
          <ellipse cx={71} cy={58} rx={6} ry={3.5} fill="#E07A8F" opacity={0.35} />
        </>
      )}
      <path
        d={f.mouth}
        fill={f.mouthFill}
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={state === "speaking" ? "vx-talk" : undefined}
      />
    </svg>
  );
}

export interface VoiceBallProps {
  state?: BallState;
  size?: number;
  /** A plain circle without the face. */
  face?: boolean;
  /** Grey it out: the system, not the learner, has a problem. */
  dimmed?: boolean;
  onPress?: () => void;
  label?: string;
}

/** The clay ball that talks with you. The only object with volume. */
export function VoiceBall({ state = "idle", size = 200, face = true, dimmed = false, onPress, label }: VoiceBallProps) {
  const ball = (
    <span
      className={cn("relative block rounded-full shadow-ball transition-[background] duration-500", `vx-s-${state}`)}
      style={{ width: size, height: size, background: BALL_COLOR[state] } as CSSProperties}
    >
      {face && <Face state={state} />}
    </span>
  );
  const name = label ?? STATE_LABEL[state].text;
  const wrapper = cn("inline-flex rounded-full", dimmed && "opacity-45 grayscale-[0.6]");
  if (!onPress) {
    return (
      <span role="img" aria-label={name} data-state={state} className={wrapper}>
        {ball}
      </span>
    );
  }
  return (
    <button type="button" onClick={onPress} aria-label={name} data-state={state} className={cn(wrapper, "cursor-pointer border-none bg-transparent p-0")}>
      {ball}
    </button>
  );
}
