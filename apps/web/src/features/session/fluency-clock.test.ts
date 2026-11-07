import { describe, expect, it } from "vitest";
import { FluencyClock } from "./fluency-clock";

describe("FluencyClock", () => {
  it("measures the tutor's voice, the pause before answering and the learner's speech", () => {
    const clock = new FluencyClock();
    clock.tutorStarted(0);
    clock.tutorStopped(4000);
    clock.learnerStarted(5500);
    // The turn ends after a silence: that silence is not speech.
    clock.learnerEnded(9700, { silenceMs: 1200 });

    expect(clock.timing()).toEqual({ tutorSpeechMs: 4000, pausesMs: [1500], learnerSpeechMs: 3000 });
  });

  it("counts no silence when the learner tapped to send", () => {
    const clock = new FluencyClock();
    clock.learnerStarted(0);
    clock.learnerEnded(2000, { silenceMs: 0 });
    expect(clock.timing().learnerSpeechMs).toBe(2000);
  });

  it("adds up several turns", () => {
    const clock = new FluencyClock();
    for (const start of [0, 10_000]) {
      clock.tutorStarted(start);
      clock.tutorStopped(start + 2000);
      clock.learnerStarted(start + 3000);
      clock.learnerEnded(start + 6000, { silenceMs: 1000 });
    }
    expect(clock.timing()).toEqual({ tutorSpeechMs: 4000, pausesMs: [1000, 1000], learnerSpeechMs: 4000 });
  });

  it("counts no pause after a pause, a typed answer or a second line from the tutor", () => {
    const clock = new FluencyClock();
    clock.tutorStopped(1000);
    clock.interrupt(); // paused, or chose to type
    clock.learnerStarted(30_000);

    clock.tutorStopped(40_000);
    clock.tutorStarted(41_000);
    clock.tutorStopped(42_000);
    clock.learnerStarted(43_000);

    expect(clock.timing().pausesMs).toEqual([1000]);
  });

  it("ignores an end without a start and never counts negative speech", () => {
    const clock = new FluencyClock();
    clock.learnerEnded(5000, { silenceMs: 1200 });
    clock.tutorStopped(6000);
    clock.learnerStarted(7000);
    clock.learnerEnded(7500, { silenceMs: 1200 });
    expect(clock.timing()).toEqual({ tutorSpeechMs: 0, pausesMs: [1000], learnerSpeechMs: 0 });
  });
});

describe("FluencyClock.from", () => {
  it("goes on from the timing measured before a reload", () => {
    const clock = FluencyClock.from({ learnerSpeechMs: 1000, tutorSpeechMs: 2000, pausesMs: [500] });
    clock.tutorStarted(0);
    clock.tutorStopped(1000);
    clock.learnerStarted(1300);
    clock.learnerEnded(2300, { silenceMs: 0 });
    expect(clock.timing()).toEqual({ learnerSpeechMs: 2000, tutorSpeechMs: 3000, pausesMs: [500, 300] });
  });

  it("counts the pause from when the microphone opened, not from a clip heard before a wait", () => {
    const clock = new FluencyClock();
    clock.tutorStarted(0);
    clock.tutorStopped(2000);
    clock.listening(5000);
    clock.learnerStarted(6000);
    expect(clock.timing().pausesMs).toEqual([1000]);
  });
});
