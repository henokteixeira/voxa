import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewService } from "../application/review.service.js";
import { applyHttpConventions } from "../common/http-app.js";
import { ReviewsController } from "./reviews.controller.js";

const service = { overview: vi.fn(), card: vi.fn(), answer: vi.fn() };
const subject = { kind: "pattern", id: "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b" };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [ReviewsController],
    providers: [{ provide: ReviewService, useValue: service }],
  }).compile();
  app = applyHttpConventions(mod.createNestApplication());
  await app.init();
});
afterEach(() => app.close());

describe("GET /reviews", () => {
  it("returns what is due for the language, English by default", async () => {
    service.overview.mockResolvedValue({ due: [], nextDueAt: new Date("2026-11-10T09:00:00Z") });
    const res = await request(app.getHttpServer()).get("/reviews");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ due: [], nextDueAt: "2026-11-10T09:00:00.000Z" });
    expect(service.overview).toHaveBeenCalledWith("en");
  });

  it("rejects a malformed language", async () => {
    const res = await request(app.getHttpServer()).get("/reviews?language=English!");
    expect(res.status).toBe(400);
  });
});

describe("POST /reviews/cards", () => {
  it("asks for a cue for one item", async () => {
    service.card.mockResolvedValue({ cardId: subject.id, cue: "Eu terminei ontem." });
    const res = await request(app.getHttpServer()).post("/reviews/cards").send({ subject });
    expect(res.status).toBe(200);
    expect(service.card).toHaveBeenCalledWith(subject);
  });

  it("rejects an unknown kind of item", async () => {
    const res = await request(app.getHttpServer()).post("/reviews/cards").send({ subject: { ...subject, kind: "other" } });
    expect(res.status).toBe(400);
  });
});

describe("POST /reviews/answers", () => {
  it("checks a spoken answer to a card, or none when the learner doesn't know", async () => {
    service.answer.mockResolvedValue({ recalled: false });
    const cardId = subject.id;
    await request(app.getHttpServer()).post("/reviews/answers").send({ cardId, utterance: "I finish it", timeZone: "America/Sao_Paulo" }).expect(200);
    await request(app.getHttpServer()).post("/reviews/answers").send({ cardId, utterance: null, timeZone: "America/Sao_Paulo" }).expect(200);
    expect(service.answer.mock.calls).toEqual([
      [cardId, "I finish it", "America/Sao_Paulo"],
      [cardId, null, "America/Sao_Paulo"],
    ]);
  });

  it("rejects an answer without a card or a time zone", async () => {
    await request(app.getHttpServer()).post("/reviews/answers").send({ utterance: "hi", timeZone: "America/Sao_Paulo" }).expect(400);
    await request(app.getHttpServer()).post("/reviews/answers").send({ cardId: subject.id, utterance: "hi" }).expect(400);
  });
});
