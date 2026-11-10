import { describe, expect, it } from "vitest";
import type { ReviewRepository, ReviewSubject } from "../domain/ports/review.repository.js";
import { firstReview, type ReviewState } from "../domain/review/review-schedule.js";
import { ReviewScheduler } from "./review-scheduler.js";

function scheduler() {
  const states = new Map<string, ReviewState>();
  const key = (s: ReviewSubject) => `${s.kind}:${s.id}`;
  const reviews: Pick<ReviewRepository, "state" | "save" | "schedules" | "due"> = {
    state: async (subject) => states.get(key(subject)) ?? null,
    save: async (_language, subject, state) => void states.set(key(subject), state),
    schedules: async () => [],
    due: async () => [],
  };
  return { states, scheduler: new ReviewScheduler(reviews) };
}

describe("ReviewScheduler.learned", () => {
  it("schedules a taken expression's first review once, and never moves it back", async () => {
    const { scheduler: s, states } = scheduler();
    const subject: ReviewSubject = { kind: "expression", id: "e1" };
    const now = new Date("2026-11-09T12:00:00Z");

    await s.learned("en", subject, now);
    expect(states.get("expression:e1")).toEqual(firstReview(now));

    const later = { step: 2, dueAt: new Date("2026-11-20T12:00:00Z") };
    states.set("expression:e1", later);
    await s.learned("en", subject, new Date("2026-11-12T12:00:00Z"));
    expect(states.get("expression:e1")).toEqual(later);
  });
});

describe("ReviewScheduler.answered", () => {
  const subject: ReviewSubject = { kind: "pattern", id: "p1" };
  const now = new Date("2026-11-09T12:00:00Z");
  const notDue = { step: 2, dueAt: new Date("2026-11-12T12:00:00Z") };

  it("leaves an item that is not due as it is when it is recalled, fast or slow", async () => {
    const { scheduler: s, states } = scheduler();
    for (const outcome of ["recalled", "slow"] as const) {
      states.set("pattern:p1", notDue);
      expect(await s.answered("en", subject, outcome, now)).toEqual(notDue);
      expect(states.get("pattern:p1")).toEqual(notDue);
    }
  });

  it("keeps a due item at its step after a slow recall, and moves it up after a fast one", async () => {
    const due = { step: 2, dueAt: now };
    const slow = scheduler();
    slow.states.set("pattern:p1", due);
    expect((await slow.scheduler.answered("en", subject, "slow", now)).step).toBe(2);
    const fast = scheduler();
    fast.states.set("pattern:p1", due);
    expect((await fast.scheduler.answered("en", subject, "recalled", now)).step).toBe(3);
  });
});
