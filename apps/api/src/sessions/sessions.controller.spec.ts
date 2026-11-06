import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConversationService,
  SessionEndedError,
  SessionNotFoundError,
} from "../application/conversation.service.js";
import { TutorUnavailableError } from "../infra/tutor/anthropic-tutor.adapter.js";
import { SessionsController } from "./sessions.controller.js";

const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const service = { start: vi.fn(), respond: vi.fn(), end: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [SessionsController],
    providers: [{ provide: ConversationService, useValue: service }],
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

describe("POST /sessions/:id/turns", () => {
  it("returns the tutor's turn", async () => {
    service.respond.mockResolvedValue({ kind: "hint", message: "Check the verb.", selfCorrected: false });
    const res = await request(app.getHttpServer()).post(`/sessions/${id}/turns`).send({ text: " I goed " });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: "hint", message: "Check the verb.", selfCorrected: false });
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
  it("returns the summary", async () => {
    const summary = { sessionId: id, mode: "daily", mistakes: [], selfCorrections: 0 };
    service.end.mockResolvedValue(summary);
    const res = await request(app.getHttpServer()).post(`/sessions/${id}/end`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(summary);
  });
});
