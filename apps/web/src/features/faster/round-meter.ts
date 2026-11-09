import { LONG_PAUSE_MS } from "@/features/session/fluency-clock";

/** What one told round measured, as the API takes it. */
export interface RoundMeasure {
  transcript: string;
  /** From the first word to the end of the last turn: the pauses between turns are part of the telling. */
  speechMs: number;
  /** Long silences inside the turns and between them. */
  longPausesMs: number[];
}

/**
 * Measures one "say it faster" round, told in one or more microphone turns. Pure (times are passed in).
 * Turns can come back from speech to text in any order; each keeps its place in the transcript.
 */
export class RoundMeter {
  private firstStart: number | null = null;
  private turnStart: number | null = null;
  private lastEnd: number | null = null;
  private readonly longPauses: number[] = [];
  private readonly texts: string[] = [];

  speechStarted(now: number) {
    if (this.lastEnd !== null && now - this.lastEnd >= LONG_PAUSE_MS) this.longPauses.push(now - this.lastEnd);
    this.firstStart ??= now;
    this.turnStart = now;
  }

  /**
   * @param trailingSilenceMs the silence the turn ended with (the wait, or what was left when it was cut or sent).
   * @param pausesMs the silences inside the turn. Returns the turn's place, for `heard`.
   */
  turnEnded(
    now: number,
    { trailingSilenceMs, pausesMs = [] }: { trailingSilenceMs: number; pausesMs?: readonly number[] },
  ): number {
    const start = this.turnStart ?? now;
    this.firstStart ??= start;
    this.lastEnd = Math.max(start, now - trailingSilenceMs);
    this.turnStart = null;
    this.longPauses.push(...pausesMs.filter((ms) => ms >= LONG_PAUSE_MS));
    return this.texts.push("") - 1;
  }

  heard(turn: number, text: string) {
    this.texts[turn] = text.trim();
  }

  measure(): RoundMeasure {
    return {
      transcript: this.texts.filter(Boolean).join(" "),
      speechMs: this.firstStart === null || this.lastEnd === null ? 0 : Math.round(this.lastEnd - this.firstStart),
      longPausesMs: this.longPauses.map(Math.round),
    };
  }
}
