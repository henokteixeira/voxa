/** Space between the ball and the ring, wider than the ball's breath while the ring shows. */
const GAP = 14;
/** The ring's width, in pixels. */
const WIDTH = 3;

/** How far the ring reaches past the ball on each side: the ball's wrapper pads this much so nothing overlaps it. */
export const BALL_RING_SPACE = GAP + WIDTH;

/**
 * A thin ring centred on the ball, drawn clockwise from the top. `filled` is the share of the arc drawn (0–1).
 * The parent wraps the ball tightly (`relative inline-flex`, padded by `BALL_RING_SPACE`) so the ring shares its centre.
 * While the ring is visible the ball keeps its round shape (see `data-ring` in index.css): a stretching ball inside
 * a fixed circle looks off-centre.
 */
export function BallRing({
  ballSize,
  filled,
  visible = true,
  ...data
}: { ballSize: number; filled: number; visible?: boolean } & Record<`data-${string}`, string | boolean>) {
  const size = ballSize + 2 * BALL_RING_SPACE;
  const radius = (size - WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = Math.min(1, Math.max(0, filled));
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 transition-opacity duration-700 ${visible ? "opacity-100" : "opacity-0"}`}
      data-ring={visible ? "on" : "off"}
      {...data}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={WIDTH} className="stroke-sand-soft" />
      {share > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={WIDTH}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
          className="stroke-mist-ink/70 transition-[stroke-dashoffset] duration-300 ease-linear"
        />
      )}
    </svg>
  );
}
