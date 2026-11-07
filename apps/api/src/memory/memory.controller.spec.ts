import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyHttpConventions } from "../common/http-app.js";
import { LearnerFactNotFoundError, LearnerMemoryService } from "../application/learner-memory.service.js";
import { MemoryController } from "./memory.controller.js";

const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const fact = {
  id,
  topic: "work",
  statement: "Works at JOCUM.",
  language: "en",
  sourceSessionId: null,
  learnedAt: new Date("2026-11-07T10:00:00Z"),
  updatedAt: new Date("2026-11-07T11:00:00Z"),
};
const service = { facts: vi.fn(), editFact: vi.fn(), deleteFact: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [MemoryController],
    providers: [{ provide: LearnerMemoryService, useValue: service }],
  }).compile();
  app = applyHttpConventions(mod.createNestApplication());
  await app.init();
});
afterEach(() => app.close());

const shown = { id, topic: "work", statement: "Works at JOCUM.", learnedAt: "2026-11-07T10:00:00.000Z", updatedAt: "2026-11-07T11:00:00.000Z" };

describe("/memory/facts", () => {
  it("lists the facts", async () => {
    service.facts.mockResolvedValue([fact]);
    const res = await request(app.getHttpServer()).get("/memory/facts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ facts: [shown] });
  });

  it("rewrites a fact, trimmed", async () => {
    service.editFact.mockResolvedValue(fact);
    const res = await request(app.getHttpServer()).patch(`/memory/facts/${id}`).send({ statement: "  Works at\n JOCUM. " });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(shown);
    expect(service.editFact).toHaveBeenCalledWith(id, "Works at JOCUM.");
  });

  it("refuses an empty statement or a bad id", async () => {
    expect((await request(app.getHttpServer()).patch(`/memory/facts/${id}`).send({ statement: " " })).status).toBe(400);
    expect((await request(app.getHttpServer()).delete("/memory/facts/not-an-id")).status).toBe(400);
    expect((await request(app.getHttpServer()).patch(`/memory/facts/${id}`).send({ statement: "x".repeat(201) })).status).toBe(400);
    expect(service.editFact).not.toHaveBeenCalled();
  });

  it("answers 404 when rewriting a fact that is gone", async () => {
    service.editFact.mockRejectedValueOnce(new LearnerFactNotFoundError(id));
    expect((await request(app.getHttpServer()).patch(`/memory/facts/${id}`).send({ statement: "New." })).status).toBe(404);
  });

  it("deletes a fact, and answers 404 for one that is gone", async () => {
    service.deleteFact.mockResolvedValueOnce(undefined);
    expect((await request(app.getHttpServer()).delete(`/memory/facts/${id}`)).status).toBe(204);
    service.deleteFact.mockRejectedValueOnce(new LearnerFactNotFoundError(id));
    expect((await request(app.getHttpServer()).delete(`/memory/facts/${id}`)).status).toBe(404);
  });
});
