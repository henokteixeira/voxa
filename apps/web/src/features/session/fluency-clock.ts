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
 * answers and how many words he spoke. Pure (times are passed in).
 * A spoken turn counts (speech time, long pauses, words) only once its transcript comes back, so
 * a turn that held no speech or failed adds nothing, and typed turns never count.
 * Speech is approximate: the learner's time runs from the detected start of speech to the end of the turn.
 */
export class FluencyClock {
  private learnerMs = 0;
  private tutorMs = 0;
  private readonly pauses: number[] = [];
  private readonly longPauses: number[] = [];
  private spokenWords = 0;
  /** False for a timing saved before words and long pauses were measured: it has no pace. */
  private measuresPace = true;
  /** A spoken turn that was sent, waiting for its transcript. */
  private pendingTurn: { speechMs: number; longPausesMs: number[] } | null = null;
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
    clock.measuresPace = timing.spokenWords !== undefined && timing.longPausesMs !== undefined;
    clock.longPauses.push(...(timing.longPausesMs ?? []));
    clock.spokenWords = timing.spokenWords ?? 0;
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
    const speechMs = this.learnerSince === null ? 0 : Math.max(0, now - this.learnerSince - silenceMs);
    this.learnerSince = null;
    this.pendingTurn = { speechMs, longPausesMs: pausesMs.filter((ms) => ms >= LONG_PAUSE_MS) };
  }

  /** The transcript of a turn came back: the spoken turn waiting for it counts now. */
  learnerSaid(text: string) {
    const turn = this.pendingTurn;
    if (!turn) return;
    this.pendingTurn = null;
    this.learnerMs += turn.speechMs;
    this.longPauses.push(...turn.longPausesMs);
    this.spokenWords += countWords(text);
  }

  /** The learner typed an answer: a spoken turn still waiting for its transcript never gets one. */
  typed() {
    this.pendingTurn = null;
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
      ...(this.measuresPace && { longPausesMs: this.longPauses.map(Math.round), spokenWords: this.spokenWords }),
    };
  }
}
