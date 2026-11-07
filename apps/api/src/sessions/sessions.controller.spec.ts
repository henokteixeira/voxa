import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConversationService,
  SessionEndedError,
  SessionNotFoundError,
} from "../application/conversation.service.js";
import { ProgressService } from "../application/progress.service.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";
import { SessionsController } from "./sessions.controller.js";

const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const service = { start: vi.fn(), resume: vi.fn(), respond: vi.fn(), end: vi.fn(), rateConfidence: vi.fn() };
const progress = { awardSession: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [SessionsController],
    providers: [
      { provide: ConversationService, useValue: service },
      { provide: ProgressService, useValue: progress },
    ],
  }).compile();
  app = mod.createNestApplication();
  await app.init();
});
afterEach(() => app.close());

describe("POST /sessions", () => {
  it("starts a session in English by default", async () => {
    service.start.mockResolvedValue({
      session: { id, language: "en", mode: "daily", pending: null, endedAt: null },
      message: "Morning!",
    });
    const res = await request(app.getHttpServer()).post("/sessions").send({ mode: "daily" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ sessionId: id, mode: "daily", language: "en", message: "Morning!" });
    expect(service.start).toHaveBeenCalledWith("daily", "en");
  });

  it.each([[{ mode: "karaoke" }], [{}], [{ mode: "daily", language: "English" }]])("rejects %j", async (body) => {
    const res = await request(app.getHttpServer()).post("/sessions").send(body);
    expect(res.status).toBe(400);
    expect(service.start).not.toHaveBeenCalled();
  });

  it("answers 502 when the tutor is not available", async () => {
    service.start.mockRejectedValue(new TutorUnavailableError("down"));
    const res = await request(app.getHttpServer()).post("/sessions").send({ mode: "review" });
    expect(res.status).toBe(502);
  });
});

describe("GET /sessions/:id", () => {
  it("returns the open session so the app can pick it up again", async () => {
    const resumed = {
      sessionId: id,
      mode: "daily",
      language: "en",
      startedAt: new Date("2026-11-07T10:00:00Z"),
      turns: [{ role: "assistant", content: "Morning!" }],
      goals: ["yesterday", "today", "blockers"],
      coveredGoals: [],
      hint: null,
    };
    service.resume.mockResolvedValue(resumed);
    const res = await request(app.getHttpServer()).get(`/sessions/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...resumed, startedAt: "2026-11-07T10:00:00.000Z" });
    expect(service.resume).toHaveBeenCalledWith(id);
  });

  it("rejects a malformed id, and maps unknown to 404 and ended to 409", async () => {
    expect((await request(app.getHttpServer()).get("/sessions/abc")).status).toBe(400);
    service.resume.mockRejectedValueOnce(new SessionNotFoundError(id));
    expect((await request(app.getHttpServer()).get(`/sessions/${id}`)).status).toBe(404);
    service.resume.mockRejectedValueOnce(new SessionEndedError(id));
    expect((await request(app.getHttpServer()).get(`/sessions/${id}`)).status).toBe(409);
  });
});

describe("POST /sessions/:id/turns", () => {
  it("returns the tutor's turn", async () => {
    service.respond.mockResolvedValue({ kind: "hint", message: "Check the verb.", selfCorrected: false, support: null });
    const res = await request(app.getHttpServer()).post(`/sessions/${id}/turns`).send({ text: " I goed " });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: "hint", message: "Check the verb.", selfCorrected: false, support: null });
    expect(service.respond).toHaveBeenCalledWith(id, "I goed");
  });

  it("rejects empty text and a malformed id", async () => {
    expect((await request(app.getHttpServer()).post(`/sessions/${id}/turns`).send({ text: "  " })).status).toBe(400);
    expect((await request(app.getHttpServer()).post("/sessions/abc/turns").send({ text: "hi" })).status).toBe(400);
  });

  it("maps an unknown session to 404 and an ended one to 409", async () => {
    service.respond.mockRejectedValueOnce(new SessionNotFoundError(id));
    expect((await request(app.getHttpServer()).post(`/sessions/${id}/turns`).send({ text: "hi" })).status).toBe(404);
    service.respond.mockRejectedValueOnce(new SessionEndedError(id));
    expect((await request(app.getHttpServer()).post(`/sessions/${id}/turns`).send({ text: "hi" })).status).toBe(409);
  });
});

describe("POST /sessions/:id/end", () => {
  const summary = {
    sessionId: id,
    mode: "daily",
    mistakes: [],
    selfCorrections: 1,
    signals: { wordsPerMinute: 72 },
    goals: [
      { id: "yesterday", covered: true },
      { id: "today", covered: false },
    ],
  };
  const xp = { awards: [{ reason: "self_corrected", count: 1, points: 5 }], total: 5 };

  it("returns the summary with the XP the session earned", async () => {
    service.end.mockResolvedValue(summary);
    progress.awardSession.mockResolvedValue(xp);
    const res = await request(app.getHttpServer()).post(`/sessions/${id}/end`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...summary, xp });
    expect(service.end).toHaveBeenCalledWith(id, null);
    expect(progress.awardSession).toHaveBeenCalledWith({
      sessionId: id,
      goalsCovered: 1,
      selfCorrections: 1,
      wordsPerMinute: 72,
    });
  });

  it("passes the timing the app measured", async () => {
    service.end.mockResolvedValue(summary);
    progress.awardSession.mockResolvedValue(xp);
    const timing = {
      learnerSpeechMs: 61_000,
      tutorSpeechMs: 40_200,
      pausesMs: [900, 1800],
      longPausesMs: [1300],
      spokenWords: 84,
    };
    const res = await request(app.getHttpServer()).post(`/sessions/${id}/end`).send({ timing });
    expect(res.status).toBe(200);
    expect(service.end).toHaveBeenCalledWith(id, timing);
  });

  it.each([
    { timing: { learnerSpeechMs: -1, tutorSpeechMs: 0, pausesMs: [] } },
    { timing: { learnerSpeechMs: 1.5, tutorSpeechMs: 0, pausesMs: [] } },
    { timing: { learnerSpeechMs: 0, tutorSpeechMs: 0, pausesMs: [-5] } },
    { timing: { learnerSpeechMs: 0, tutorSpeechMs: 0 } },
    { timing: { learnerSpeechMs: 0, tutorSpeechMs: 0, pausesMs: [], longPausesMs: [-1] } },
    { timing: { learnerSpeechMs: 0, tutorSpeechMs: 0, pausesMs: [], spokenWords: 2.5 } },
  ])("rejects bad timing %j", async (body) => {
    const res = await request(app.getHttpServer()).post(`/sessions/${id}/end`).send(body);
    expect(res.status).toBe(400);
    expect(service.end).not.toHaveBeenCalled();
  });
});

describe("POST /sessions/:id/confidence", () => {
  it("stores a rating", async () => {
    const res = await request(app.getHttpServer()).post(`/sessions/${id}/confidence`).send({ moment: "after", value: 4 });
    expect(res.status).toBe(204);
    expect(service.rateConfidence).toHaveBeenCalledWith(id, "after", 4);
  });

  it.each([
    { moment: "after", value: 0 },
    { moment: "after", value: 6 },
    { moment: "after", value: 3.5 },
    { moment: "during", value: 3 },
    { value: 3 },
  ])("rejects %j", async (body) => {
    const res = await request(app.getHttpServer()).post(`/sessions/${id}/confidence`).send(body);
    expect(res.status).toBe(400);
    expect(service.rateConfidence).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown session", async () => {
    service.rateConfidence.mockRejectedValue(new SessionNotFoundError(id));
    const res = await request(app.getHttpServer()).post(`/sessions/${id}/confidence`).send({ moment: "before", value: 2 });
    expect(res.status).toBe(404);
  });
});
