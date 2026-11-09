/**
 * Decides when the learner starts and stops talking from the loudness of short audio frames.
 * Energy-based with an adaptive noise floor: simple, no model to download. Pure, so it is unit-tested;
 * a model-based detector (e.g. Silero) can replace it behind the same push() contract.
 */
export interface TurnDetectorOptions {
  /** Speech must last this long before it counts (ignores clicks and coughs). */
  minSpeechMs: number;
  /** Silence this long ends the turn. Learners pause mid-sentence, so keep it generous. */
  endSilenceMs: number;
  /** A turn never runs longer than this. */
  maxTurnMs: number;
  /** A frame is speech when it is this many times louder than the noise floor… */
  floorRatio: number;
  /** …and at least this loud (RMS of samples in [-1, 1]). */
  minLevel: number;
  /** The first moments only learn the room's noise; nothing starts a turn. */
  calibrationMs: number;
}

export const DEFAULT_TURN_OPTIONS: TurnDetectorOptions = {
  minSpeechMs: 250,
  endSilenceMs: 2500,
  maxTurnMs: 60_000,
  floorRatio: 3,
  minLevel: 0.015,
  calibrationMs: 500,
};

export type TurnEvent = "start" | "end" | null;

export class TurnDetector {
  private readonly options: TurnDetectorOptions;
  private floor = 0.005;
  private speaking = false;
  private loudMs = 0;
  private silentMs = 0;
  private turnMs = 0;
  private heardMs = 0;
  private gaps: number[] = [];
  private trailingMs = 0;

  constructor(options: Partial<TurnDetectorOptions> = {}) {
    this.options = { ...DEFAULT_TURN_OPTIONS, ...options };
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** The silences inside the current (or last) turn that speech resumed after, in ms. Not the silence that ended it. */
  get pausesMs(): readonly number[] {
    return this.gaps;
  }

  /** The silence at the end of the last turn: the wait that ended it, less when the turn hit its limit or was sent at once. */
  get trailingSilenceMs(): number {
    return this.trailingMs;
  }

  /** Feeds one frame's RMS level and length; returns "start" or "end" when the turn changes. */
  push(level: number, frameMs: number): TurnEvent {
    const { minSpeechMs, endSilenceMs, maxTurnMs, floorRatio, minLevel, calibrationMs } = this.options;
    // Calibration and the noise floor are shared with learn().
    if (this.heardMs < calibrationMs) {
      this.learn(level, frameMs);
      return null;
    }
    const loud = level > Math.max(this.floor * floorRatio, minLevel);

    if (!this.speaking) {
      // Follow the room's noise while nobody talks: fall fast, rise slowly so speech does not hide itself.
      this.learn(level, frameMs);
      if (!loud) {
        this.loudMs = 0;
        return null;
      }
      this.loudMs += frameMs;
      if (this.loudMs < minSpeechMs) return null;
      this.speaking = true;
      this.turnMs = this.loudMs;
      this.silentMs = 0;
      this.gaps = [];
      return "start";
    }

    this.turnMs += frameMs;
    if (loud && this.silentMs > 0) this.gaps.push(this.silentMs);
    this.silentMs = loud ? 0 : this.silentMs + frameMs;
    if (this.silentMs >= endSilenceMs || this.turnMs >= maxTurnMs) {
      this.reset();
      return "end";
    }
    return null;
  }

  /** Learns the room's noise from a frame nobody is answering in (the tutor's turn); never starts a turn. */
  learn(level: number, frameMs: number): void {
    if (this.heardMs < this.options.calibrationMs) {
      this.heardMs += frameMs;
      this.floor = this.floor * 0.8 + level * 0.2;
    } else {
      this.floor += (level - this.floor) * (level < this.floor ? 0.05 : 0.01);
    }
  }

  /** Forgets the current turn (keeps the learned noise floor). */
  reset(): void {
    if (this.speaking) this.trailingMs = this.silentMs;
    this.speaking = false;
    this.loudMs = 0;
    this.silentMs = 0;
    this.turnMs = 0;
  }
}

/** Root mean square of a frame of samples in [-1, 1]. */
export function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (const sample of frame) sum += sample * sample;
  return Math.sqrt(sum / frame.length);
}
