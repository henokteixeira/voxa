import { rms, type TurnDetector } from "./turn-detector";
import { downsample, encodeWav, SPEECH_SAMPLE_RATE } from "./wav";

/** Audio kept from before the detector fires, so the first syllable is not cut off. */
const PRE_ROLL_MS = 400;

/** A finished turn: its audio, and the silences inside it that speech resumed after (ms). */
export interface RecordedTurn {
  wav: ArrayBuffer;
  pausesMs: number[];
}

export type RecorderEvent = { type: "start" } | ({ type: "turn" } & RecordedTurn) | null;

/**
 * Turns a stream of microphone frames into finished turns (WAV), using a TurnDetector.
 * Pure: the browser glue (microphone.ts) only feeds it frames.
 */
export class TurnRecorder {
  private readonly preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  private turn: Float32Array[] = [];
  private readonly detector: TurnDetector;
  private readonly sampleRate: number;

  constructor(detector: TurnDetector, sampleRate: number) {
    this.detector = detector;
    this.sampleRate = sampleRate;
  }

  push(frame: Float32Array): RecorderEvent {
    const frameMs = (frame.length / this.sampleRate) * 1000;
    const wasSpeaking = this.detector.isSpeaking;
    const event = this.detector.push(rms(frame), frameMs);

    if (event === "start") {
      this.turn = [...this.preRoll, frame];
      this.clearPreRoll();
      return { type: "start" };
    }
    if (wasSpeaking) {
      this.turn.push(frame);
      return event === "end" ? { type: "turn", ...this.finish() } : null;
    }
    this.keepPreRoll(frame);
    return null;
  }

  /** Learns the room's noise without making turns (while the microphone is paused). */
  learn(frame: Float32Array): void {
    this.detector.learn(rms(frame), (frame.length / this.sampleRate) * 1000);
  }

  /** Ends the turn now (the learner tapped to send). Null when nobody was talking. */
  flush(): RecordedTurn | null {
    if (!this.detector.isSpeaking) return null;
    this.detector.reset();
    return this.finish();
  }

  /** Drops whatever was heard (e.g. while the tutor speaks). */
  discard(): void {
    this.detector.reset();
    this.turn = [];
    this.clearPreRoll();
  }

  private finish(): RecordedTurn {
    const length = this.turn.reduce((n, f) => n + f.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const f of this.turn) {
      samples.set(f, offset);
      offset += f.length;
    }
    this.turn = [];
    return {
      wav: encodeWav(downsample(samples, this.sampleRate), Math.min(this.sampleRate, SPEECH_SAMPLE_RATE)),
      pausesMs: [...this.detector.pausesMs],
    };
  }

  private keepPreRoll(frame: Float32Array) {
    this.preRoll.push(frame);
    this.preRollSamples += frame.length;
    const max = (PRE_ROLL_MS / 1000) * this.sampleRate;
    while (this.preRollSamples - this.preRoll[0].length >= max) {
      this.preRollSamples -= this.preRoll.shift()!.length;
    }
  }

  private clearPreRoll() {
    this.preRoll.length = 0;
    this.preRollSamples = 0;
  }
}
