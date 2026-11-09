/** A ring around the ball that empties as a timed telling runs out (`share` of the time left, 0–1). */
export function TimeRing({ ballSize, share }: { ballSize: number; share: number }) {
  const size = ballSize + 26;
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90"
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={4} className="stroke-sand" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - share)}
        className="stroke-honey transition-[stroke-dashoffset] duration-300 ease-linear"
      />
    </svg>
  );
}
