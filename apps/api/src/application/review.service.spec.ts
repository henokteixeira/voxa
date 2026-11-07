import { beforeEach, describe, expect, it } from "vitest";
import type { ReviewCoachPort, ReviewCue } from "../domain/ports/review-coach.port.js";
import type { ReviewItem, ReviewRepository, ReviewSubject } from "../domain/ports/review.repository.js";
import type { ReviewState } from "../domain/review/review-schedule.js";
import { ReviewScheduler } from "./review-scheduler.js";
import { ReviewItemNotFoundError, ReviewService } from "./review.service.js";

const now = new Date("2026-11-07T12:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);
const subject: ReviewSubject = { kind: "pattern", id: "p1" };
const cue: ReviewCue = { cue: "Eu terminei o relatório ontem.", answer: "I finished the report yesterday." };

class FakeReviews implements ReviewRepository {
  states = new Map<string, ReviewState>();
  async state(s: ReviewSubject) {
    return this.states.get(s.id) ?? null;
  }
  async save(_language: string, s: ReviewSubject, state: ReviewState) {
    this.states.set(s.id, state);
  }
  async due() {
    return [];
  }
  async item(s: ReviewSubject): Promise<ReviewItem | null> {
    const state = this.states.get(s.id);
    if (!state) return null;
    return { subject: s, language: "en", category: "verb_tense", name: "Past", rule: "Passado.", examples: [], ...state };
  }
  async nextDueAt() {
    return null;
  }
}

class FakeCoach implements ReviewCoachPort {
  checked: string[] = [];
  recalled = true;
  async cue() {
    return cue;
  }
  async check(_item: ReviewItem, _cue: ReviewCue, utterance: string) {
    this.checked.push(utterance);
    return this.recalled;
  }
}

let reviews: FakeReviews;
let coach: FakeCoach;
let service: ReviewService;

beforeEach(() => {
  reviews = new FakeReviews();
  coach = new FakeCoach();
  const clock = { now: () => new Date(now) };
  service = new ReviewService(reviews, coach, { load: async () => "" }, clock, new ReviewScheduler(reviews));
});

describe("ReviewService", () => {
  it("gives a new cue for an item", async () => {
    reviews.states.set("p1", { step: 1, dueAt: now });
    expect((await service.card(subject)).cue).toEqual(cue);
  });

  it("moves a due item forward when the answer is right", async () => {
    reviews.states.set("p1", { step: 1, dueAt: day(-1) });
    const result = await service.answer(subject, cue, " I finished the report yesterday ");

    expect(coach.checked).toEqual(["I finished the report yesterday"]);
    expect(result).toEqual({ recalled: true, answer: cue.answer, rule: "Passado.", nextDueAt: day(7) });
  });

  it("moves it back on a wrong answer or on \"I don't know\", without asking the coach", async () => {
    reviews.states.set("p1", { step: 2, dueAt: day(-1) });
    coach.recalled = false;
    await service.answer(subject, cue, "I finish the report");
    expect(reviews.states.get("p1")).toEqual({ step: 1, dueAt: day(3) });

    await service.answer(subject, cue, null);
    expect(reviews.states.get("p1")).toEqual({ step: 0, dueAt: day(1) });
    expect(coach.checked).toHaveLength(1);
  });

  it("keeps the schedule when an item practiced early is said right", async () => {
    reviews.states.set("p1", { step: 2, dueAt: day(4) });
    expect((await service.answer(subject, cue, "I finished it")).nextDueAt).toEqual(day(4));
    expect(reviews.states.get("p1")).toEqual({ step: 2, dueAt: day(4) });
  });

  it("fails for an item that is gone", async () => {
    await expect(service.card(subject)).rejects.toBeInstanceOf(ReviewItemNotFoundError);
  });
});
