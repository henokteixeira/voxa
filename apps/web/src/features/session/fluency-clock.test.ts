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
    clock.learnerSaid("hello");

    expect(clock.timing()).toMatchObject({ tutorSpeechMs: 4000, pausesMs: [1500], learnerSpeechMs: 3000 });
  });

  it("counts no silence when the learner tapped to send", () => {
    const clock = new FluencyClock();
    clock.learnerStarted(0);
    clock.learnerEnded(2000, { silenceMs: 0 });
    clock.learnerSaid("hello");
    expect(clock.timing().learnerSpeechMs).toBe(2000);
  });

  it("adds up several turns", () => {
    const clock = new FluencyClock();
    for (const start of [0, 10_000]) {
      clock.tutorStarted(start);
      clock.tutorStopped(start + 2000);
      clock.learnerStarted(start + 3000);
      clock.learnerEnded(start + 6000, { silenceMs: 1000 });
      clock.learnerSaid("hello");
    }
    expect(clock.timing()).toMatchObject({ tutorSpeechMs: 4000, pausesMs: [1000, 1000], learnerSpeechMs: 4000 });
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
    expect(clock.timing()).toMatchObject({ tutorSpeechMs: 0, pausesMs: [1000], learnerSpeechMs: 0 });
  });
});

describe("FluencyClock, long pauses and words", () => {
  it("keeps only the silences of at least a second inside an answer", () => {
    const clock = new FluencyClock();
    clock.learnerStarted(0);
    clock.learnerEnded(8000, { silenceMs: 2500, pausesMs: [300, 999, 1000, 1800] });
    clock.learnerSaid("hello");
    expect(clock.timing().longPausesMs).toEqual([1000, 1800]);
  });

  it("counts a spoken turn only once its transcript comes back", () => {
    const clock = new FluencyClock();
    clock.learnerStarted(0);
    clock.learnerEnded(3000, { silenceMs: 0, pausesMs: [1500] });
    expect(clock.timing()).toMatchObject({ learnerSpeechMs: 0, longPausesMs: [], spokenWords: 0 });
    clock.learnerSaid("one two three");
    expect(clock.timing()).toMatchObject({ learnerSpeechMs: 3000, longPausesMs: [1500], spokenWords: 3 });
  });

  it("drops a spoken turn that got no transcript when the learner types next", () => {
    const clock = new FluencyClock();
    clock.learnerStarted(0);
    clock.learnerEnded(3000, { silenceMs: 0 }); // the audio held no speech: no transcript
    clock.typed();
    clock.learnerSaid("my typed answer"); // the typed turn's transcript
    expect(clock.timing()).toMatchObject({ learnerSpeechMs: 0, spokenWords: 0 });
  });

  it("has no pace after a reload of a timing measured before words and long pauses", () => {
    const clock = FluencyClock.from({ learnerSpeechMs: 1000, tutorSpeechMs: 2000, pausesMs: [500] });
    clock.learnerStarted(0);
    clock.learnerEnded(1000, { silenceMs: 0 });
    clock.learnerSaid("hello");
    expect(clock.timing()).toEqual({ learnerSpeechMs: 2000, tutorSpeechMs: 2000, pausesMs: [500] });
  });

  it("counts the words of spoken turns, not typed ones", () => {
    const clock = new FluencyClock();
    clock.learnerSaid("a typed answer here"); // no spoken turn was sent
    clock.learnerStarted(0);
    clock.learnerEnded(3000, { silenceMs: 0 });
    clock.learnerSaid("I'm fixing the API-keys bug");
    clock.learnerSaid("another typed one"); // the spoken turn's transcript already came
    expect(clock.timing().spokenWords).toBe(5);
  });
});

describe("FluencyClock.from", () => {
  it("goes on from the timing measured before a reload", () => {
    const clock = FluencyClock.from({
      learnerSpeechMs: 1000,
      tutorSpeechMs: 2000,
      pausesMs: [500],
      longPausesMs: [1100],
      spokenWords: 4,
    });
    clock.tutorStarted(0);
    clock.tutorStopped(1000);
    clock.learnerStarted(1300);
    clock.learnerEnded(2300, { silenceMs: 0, pausesMs: [1000] });
    clock.learnerSaid("two words");
    expect(clock.timing()).toEqual({
      learnerSpeechMs: 2000,
      tutorSpeechMs: 3000,
      pausesMs: [500, 300],
      longPausesMs: [1100, 1000],
      spokenWords: 6,
    });
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
