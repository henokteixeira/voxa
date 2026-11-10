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
