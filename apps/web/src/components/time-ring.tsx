import { BallRing } from "./ball-ring";

/** A ring around the ball that empties as a timed telling runs out (`share` of the time left, 0–1). */
export function TimeRing({ ballSize, share }: { ballSize: number; share: number }) {
  return <BallRing ballSize={ballSize} filled={share} />;
}
