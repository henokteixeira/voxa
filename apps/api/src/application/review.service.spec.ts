import { beforeEach, describe, expect, it } from "vitest";
import type { ReviewCoachPort, ReviewCue } from "../domain/ports/review-coach.port.js";
import type { AnsweredCard, ReviewItem, ReviewRepository, ReviewSubject, StoredReviewCard } from "../domain/ports/review.repository.js";
import type { ReviewState } from "../domain/review/review-schedule.js";
import { ReviewScheduler } from "./review-scheduler.js";
import { ReviewCardNotFoundError, ReviewItemNotFoundError, ReviewService } from "./review.service.js";

const now = new Date("2026-11-07T12:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);
const subject: ReviewSubject = { kind: "pattern", id: "p1" };
const tz = "America/Sao_Paulo";
const cue: ReviewCue = { cue: "Eu terminei o relatório ontem.", answer: "I finished the report yesterday." };

class FakeReviews implements ReviewRepository {
  states = new Map<string, ReviewState>();
  cards = new Map<string, StoredReviewCard>();
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
  async addCard(s: ReviewSubject, c: ReviewCue) {
    const card = { id: `c${this.cards.size + 1}`, subject: s, ...c, recalled: null };
    this.cards.set(card.id, card);
    return card;
  }
  async card(id: string) {
    return this.cards.get(id) ?? null;
  }
  answered: AnsweredCard[] = [];
  async answerCard(id: string, recalled: boolean, at: Date) {
    const card = this.cards.get(id);
    if (!card || card.recalled !== null) return false;
    card.recalled = recalled;
    this.answered.push({ cardId: id, itemId: card.subject.id, answeredAt: at });
    return true;
  }
  async schedules() {
    return [];
  }
  async answeredSince(_language: string, since: Date) {
    return this.answered.filter((a) => a.answeredAt >= since);
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

async function cardFor(state: ReviewState) {
  reviews.states.set("p1", state);
  return (await service.card(subject)).cardId;
}

describe("ReviewService", () => {
  it("gives a new cue for an item, keeping its answer on the server", async () => {
    reviews.states.set("p1", { step: 1, dueAt: now });
    const card = await service.card(subject);
    expect(card).toMatchObject({ cardId: "c1", cue: cue.cue });
    expect(card).not.toHaveProperty("answer");
  });

  it("moves a due item forward when the answer is right", async () => {
    const cardId = await cardFor({ step: 1, dueAt: day(-1) });
    const result = await service.answer(cardId, " I finished the report yesterday ", tz);

    expect(coach.checked).toEqual(["I finished the report yesterday"]);
    expect(result).toEqual({ recalled: true, answer: cue.answer, rule: "Passado.", nextDueAt: day(7), xp: 1 });
  });

  it("keeps a due item at its step when the right answer came after a long search", async () => {
    const result = await service.answer(await cardFor({ step: 1, dueAt: day(-1) }), "I finished the report", tz, 9_000);
    expect(result).toMatchObject({ recalled: true, nextDueAt: day(3) });
    expect(reviews.states.get("p1")).toEqual({ step: 1, dueAt: day(3) });
  });

  it("moves it back on a wrong answer or on \"I don't know\", without asking the coach", async () => {
    coach.recalled = false;
    await service.answer(await cardFor({ step: 2, dueAt: day(-1) }), "I finish the report", tz);
    expect(reviews.states.get("p1")).toEqual({ step: 1, dueAt: day(3) });

    await service.answer(await cardFor({ step: 1, dueAt: day(-1) }), null, tz);
    expect(reviews.states.get("p1")).toEqual({ step: 0, dueAt: day(1) });
    expect(coach.checked).toHaveLength(1);
  });

  it("answers a card once: a retried answer repeats the result and moves nothing", async () => {
    const cardId = await cardFor({ step: 2, dueAt: day(-1) });
    const first = await service.answer(cardId, null, tz);
    const again = await service.answer(cardId, null, tz);

    expect(again).toEqual(first);
    expect(reviews.states.get("p1")).toEqual({ step: 1, dueAt: day(3) });
  });

  it("gives XP for an item's first answer of the learner's day only", async () => {
    const first = await service.answer(await cardFor({ step: 2, dueAt: day(-1) }), null, tz);
    const second = await service.answer(await cardFor({ step: 1, dueAt: day(-1) }), "I finished it", tz);
    expect([first.xp, second.xp]).toEqual([1, 0]);
  });

  it("keeps the schedule when an item practiced early is said right", async () => {
    const cardId = await cardFor({ step: 2, dueAt: day(4) });
    expect((await service.answer(cardId, "I finished it", tz)).nextDueAt).toEqual(day(4));
    expect(reviews.states.get("p1")).toEqual({ step: 2, dueAt: day(4) });
  });

  it("fails for an item or a card that is gone", async () => {
    await expect(service.card(subject)).rejects.toBeInstanceOf(ReviewItemNotFoundError);
    await expect(service.answer("missing", null, tz)).rejects.toBeInstanceOf(ReviewCardNotFoundError);
  });
});
