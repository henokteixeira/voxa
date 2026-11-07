import { describe, expect, it } from "vitest";
import { rms, TurnDetector } from "./turn-detector";

const FRAME = 20;
const QUIET = 0.002;
const LOUD = 0.2;

/** Pushes `ms` worth of frames at one level and returns the events that fired. */
function feed(detector: TurnDetector, level: number, ms: number) {
  const events: string[] = [];
  for (let t = 0; t < ms; t += FRAME) {
    const event = detector.push(level, FRAME);
    if (event) events.push(event);
  }
  return events;
}

describe("TurnDetector", () => {
  it("starts a turn once speech lasts long enough", () => {
    const detector = new TurnDetector();
    expect(feed(detector, QUIET, 500)).toEqual([]);
    expect(feed(detector, LOUD, 240)).toEqual([]);
    expect(feed(detector, LOUD, 20)).toEqual(["start"]);
    expect(detector.isSpeaking).toBe(true);
  });

  it("ignores a short click", () => {
    const detector = new TurnDetector();
    feed(detector, QUIET, 500);
    expect(feed(detector, LOUD, 100)).toEqual([]);
    expect(feed(detector, QUIET, 200)).toEqual([]);
    expect(feed(detector, LOUD, 200)).toEqual([]);
    expect(detector.isSpeaking).toBe(false);
  });

  it("keeps the turn open through a short thinking pause", () => {
    const detector = new TurnDetector();
    feed(detector, QUIET, 500);
    feed(detector, LOUD, 1000);
    expect(feed(detector, QUIET, 800)).toEqual([]);
    expect(feed(detector, LOUD, 500)).toEqual([]);
    expect(detector.isSpeaking).toBe(true);
  });

  it("ends the turn after the end-of-turn silence", () => {
    const detector = new TurnDetector({ endSilenceMs: 1200 });
    feed(detector, QUIET, 500);
    feed(detector, LOUD, 1000);
    expect(feed(detector, QUIET, 1180)).toEqual([]);
    expect(feed(detector, QUIET, 20)).toEqual(["end"]);
    expect(detector.isSpeaking).toBe(false);
  });

  it("by default waits 2.5 s of silence, so a thinking pause does not end the turn", () => {
    const detector = new TurnDetector();
    feed(detector, QUIET, 500);
    feed(detector, LOUD, 1000);
    expect(feed(detector, QUIET, 2480)).toEqual([]);
    expect(feed(detector, LOUD, 500)).toEqual([]);
    expect(feed(detector, QUIET, 2480)).toEqual([]);
    expect(feed(detector, QUIET, 20)).toEqual(["end"]);
  });

  it("cuts a turn that runs too long", () => {
    const detector = new TurnDetector({ maxTurnMs: 2000 });
    feed(detector, QUIET, 500);
    expect(feed(detector, LOUD, 2000)).toEqual(["start", "end"]);
  });

  it("adapts to a noisy room: steady fan noise is not speech", () => {
    const detector = new TurnDetector();
    expect(feed(detector, 0.03, 5000)).toEqual([]);
    expect(detector.isSpeaking).toBe(false);
    expect(feed(detector, 0.3, 300)).toEqual(["start"]);
  });

  it("calibrates while paused, so the first answer is heard at once", () => {
    const detector = new TurnDetector();
    for (let t = 0; t < 2000; t += FRAME) detector.learn(QUIET, FRAME);
    expect(feed(detector, LOUD, 260)).toEqual(["start"]);
  });

  it("only learns the noise at first, even when it is loud", () => {
    const detector = new TurnDetector({ calibrationMs: 500 });
    expect(feed(detector, 0.05, 480)).toEqual([]);
    expect(feed(detector, 0.05, 1000)).toEqual([]);
  });
});

describe("rms", () => {
  it("measures loudness", () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array())).toBe(0);
  });
});
