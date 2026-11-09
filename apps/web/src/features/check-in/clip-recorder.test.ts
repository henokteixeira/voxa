import { describe, expect, it } from "vitest";
import { ClipRecorder } from "./clip-recorder";

describe("ClipRecorder", () => {
  it("keeps every frame, silences too, as one 16 kHz WAV", () => {
    const clip = new ClipRecorder();
    // 50 frames of 20 ms at 48 kHz: 1 s.
    for (let i = 0; i < 50; i++) clip.push(new Float32Array(960).fill(i % 2 ? 0 : 0.5), 48_000);
    expect(clip.durationMs).toBe(1000);
    const wav = clip.wav();
    expect(new DataView(wav).getUint32(24, true)).toBe(16_000);
    expect(wav.byteLength).toBe(44 + 16_000 * 2);
  });
});
