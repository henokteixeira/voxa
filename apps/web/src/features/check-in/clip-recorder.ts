import { downsample, encodeWav, SPEECH_SAMPLE_RATE } from "@/lib/voice/wav";

/** Collects every microphone frame of a stretch (silences included) into one 16 kHz WAV. Pure. */
export class ClipRecorder {
  private readonly frames: Float32Array[] = [];
  private rate = SPEECH_SAMPLE_RATE;

  push(frame: Float32Array, sampleRate: number) {
    // Downsampled as it comes, so 2 minutes stay small in memory.
    this.frames.push(downsample(frame, sampleRate));
    this.rate = Math.min(sampleRate, SPEECH_SAMPLE_RATE);
  }

  get durationMs(): number {
    return (this.frames.reduce((n, f) => n + f.length, 0) / this.rate) * 1000;
  }

  wav(): ArrayBuffer {
    const samples = new Float32Array(this.frames.reduce((n, f) => n + f.length, 0));
    let offset = 0;
    for (const frame of this.frames) {
      samples.set(frame, offset);
      offset += frame.length;
    }
    return encodeWav(samples, this.rate);
  }
}
