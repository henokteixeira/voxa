import type { SessionTiming } from "@/lib/api";

/**
 * Measures a live session for the fluency signals: how long each side spoke, and the pause between
 * the end of the tutor's voice and the start of the learner's answer. Pure (times are passed in).
 * Speech is approximate: the learner's time runs from the detected start of speech to the end of the turn.
 */
export class FluencyClock {
  private learnerMs = 0;
  private tutorMs = 0;
  private readonly pauses: number[] = [];
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

  /** @param silenceMs the silence that ended the turn (the turn detector's wait), or 0 when the learner tapped to send. */
  learnerEnded(now: number, { silenceMs }: { silenceMs: number }) {
    if (this.learnerSince !== null) this.learnerMs += Math.max(0, now - this.learnerSince - silenceMs);
    this.learnerSince = null;
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
    };
  }
}
