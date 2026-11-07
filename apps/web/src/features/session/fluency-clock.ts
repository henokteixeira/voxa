import type { SessionTiming } from "@/lib/api";

/** A silence inside a spoken answer at least this long counts as a long pause (a design choice, not a research threshold). */
export const LONG_PAUSE_MS = 1000;

/** Words with a letter or digit, as the API counts them. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/**
 * Measures a live session for the fluency signals: how long each side spoke, the pause between
 * the end of the tutor's voice and the start of the learner's answer, the long silences inside his
 * answers and how many words he spoke (typed turns do not count). Pure (times are passed in).
 * Speech is approximate: the learner's time runs from the detected start of speech to the end of the turn.
 */
export class FluencyClock {
  private learnerMs = 0;
  private tutorMs = 0;
  private readonly pauses: number[] = [];
  private readonly longPauses: number[] = [];
  private spokenWords = 0;
  /** A spoken turn was sent and its transcript is awaited. */
  private awaitingTranscript = false;
  private tutorSince: number | null = null;
  private learnerSince: number | null = null;
  /** When the tutor stopped and the learner's answer is awaited. */
  private waitingSince: number | null = null;

  /** Goes on from the timing measured before a reload. */
  static from(timing: SessionTiming): FluencyClock {
    const clock = new FluencyClock();
    clock.learnerMs = timing.learnerSpeechMs;
    clock.tutorMs = timing.tutorSpeechMs;
    clock.pauses.push(...timing.pausesMs);
    clock.longPauses.push(...timing.longPausesMs);
    clock.spokenWords = timing.spokenWords;
    return clock;
  }

  tutorStarted(now: number) {
    this.tutorSince = now;
    this.waitingSince = null;
  }

  tutorStopped(now: number) {
    if (this.tutorSince !== null) this.tutorMs += Math.max(0, now - this.tutorSince);
    this.tutorSince = null;
    this.waitingSince = now;
  }

  learnerStarted(now: number) {
    if (this.waitingSince !== null) this.pauses.push(Math.max(0, now - this.waitingSince));
    this.waitingSince = null;
    this.learnerSince = now;
  }

  /**
   * @param silenceMs the silence that ended the turn (the turn detector's wait), or 0 when the learner tapped to send.
   * @param pausesMs the silences inside the turn that speech resumed after.
   */
  learnerEnded(now: number, { silenceMs, pausesMs = [] }: { silenceMs: number; pausesMs?: readonly number[] }) {
    if (this.learnerSince !== null) this.learnerMs += Math.max(0, now - this.learnerSince - silenceMs);
    this.learnerSince = null;
    this.longPauses.push(...pausesMs.filter((ms) => ms >= LONG_PAUSE_MS));
    this.awaitingTranscript = true;
  }

  /** The transcript of a turn came back. Only a spoken turn's words count. */
  learnerSaid(text: string) {
    if (!this.awaitingTranscript) return;
    this.awaitingTranscript = false;
    this.spokenWords += countWords(text);
  }

  /** The microphone opened: the learner's pause runs from now, not from the end of a clip heard before a wait. */
  listening(now: number) {
    if (this.waitingSince !== null) this.waitingSince = Math.max(this.waitingSince, now);
  }

  /** The learner paused the session or chose to type: the current wait is not a pause before speaking. */
  interrupt() {
    this.waitingSince = null;
  }

  timing(): SessionTiming {
    return {
      learnerSpeechMs: Math.round(this.learnerMs),
      tutorSpeechMs: Math.round(this.tutorMs),
      pausesMs: this.pauses.map(Math.round),
      longPausesMs: this.longPauses.map(Math.round),
      spokenWords: this.spokenWords,
    };
  }
}
