import { describe, expect, it } from "vitest";
import { TurnDetector } from "./turn-detector";
import { TurnRecorder } from "./turn-recorder";
import { downsample, encodeWav } from "./wav";

const RATE = 48_000;
const FRAME = 960; // 20 ms

function frame(level: number) {
  // A square wave has RMS equal to its amplitude.
  return Float32Array.from({ length: FRAME }, (_, i) => (i % 2 ? level : -level));
}

function feed(recorder: TurnRecorder, level: number, ms: number) {
  const events = [];
  for (let t = 0; t < ms; t += 20) {
    const event = recorder.push(frame(level));
    if (event) events.push(event);
  }
  return events;
}

function wavSeconds(wav: ArrayBuffer) {
  const view = new DataView(wav);
  return view.getUint32(40, true) / 2 / view.getUint32(24, true);
}

describe("TurnRecorder", () => {
  it("returns the whole turn as 16 kHz WAV, with the speech before detection", () => {
    const recorder = new TurnRecorder(new TurnDetector({ minSpeechMs: 200, endSilenceMs: 600 }), RATE);
    feed(recorder, 0.001, 1000);
    const start = feed(recorder, 0.2, 1000);
    const end = feed(recorder, 0.001, 600);

    expect(start).toEqual([{ type: "start" }]);
    expect(end).toHaveLength(1);
    const turn = end[0] as { type: "turn"; wav: ArrayBuffer };
    expect(new DataView(turn.wav).getUint32(24, true)).toBe(16_000);
    // 1 s of speech + 0.6 s of closing silence + up to 0.4 s of pre-roll.
    expect(wavSeconds(turn.wav)).toBeGreaterThanOrEqual(1.6);
    expect(wavSeconds(turn.wav)).toBeLessThanOrEqual(2.0);
  });

  it("sends early on flush, and has nothing to flush in silence", () => {
    const recorder = new TurnRecorder(new TurnDetector({ minSpeechMs: 200 }), RATE);
    feed(recorder, 0.001, 600);
    expect(recorder.flush()).toBeNull();
    feed(recorder, 0.2, 500);
    expect(recorder.flush()).toBeInstanceOf(ArrayBuffer);
    expect(feed(recorder, 0.001, 2000)).toEqual([]);
  });

  it("forgets the turn on discard", () => {
    const recorder = new TurnRecorder(new TurnDetector({ minSpeechMs: 200, endSilenceMs: 600 }), RATE);
    feed(recorder, 0.001, 600);
    feed(recorder, 0.2, 500);
    recorder.discard();
    expect(feed(recorder, 0.001, 1000)).toEqual([]);
  });
});

describe("wav", () => {
  it("writes a 16-bit mono PCM header and clamps samples", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000);
    const view = new DataView(wav);
    const tag = (o: number) => String.fromCharCode(...new Uint8Array(wav, o, 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect([2, 3, 4, 5].map((i) => view.getInt16(44 + (i - 2) * 2, true))).toEqual([0, 32767, -32768, 32767]);
  });

  it("downsamples by averaging", () => {
    expect(Array.from(downsample(new Float32Array([1, 1, 1, 0, 0, 0]), 48_000, 16_000))).toEqual([1, 0]);
    const same = new Float32Array([1, 2]);
    expect(downsample(same, 16_000, 16_000)).toBe(same);
  });
});
