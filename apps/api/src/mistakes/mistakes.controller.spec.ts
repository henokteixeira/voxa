import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MistakeBankService, MistakeNotFoundError } from "../application/mistake-bank.service.js";
import { MistakesController } from "./mistakes.controller.js";

const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const service = { list: vi.fn(), dismiss: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [MistakesController],
    providers: [{ provide: MistakeBankService, useValue: service }],
  }).compile();
  app = mod.createNestApplication();
  await app.init();
});
afterEach(() => app.close());

describe("GET /mistakes", () => {
  it("lists English mistakes by default", async () => {
    service.list.mockResolvedValue([
      {
        id,
        language: "en",
        original: "I goed",
        correction: "I went",
        category: "grammar",
        occurrences: 2,
        lastSeenAt: new Date("2026-11-05T10:00:00Z"),
        status: "improving",
      },
    ]);
    const res = await request(app.getHttpServer()).get("/mistakes");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      mistakes: [
        {
          id,
          language: "en",
          original: "I goed",
          correction: "I went",
          category: "grammar",
          occurrences: 2,
          lastSeenAt: "2026-11-05T10:00:00.000Z",
          status: "improving",
        },
      ],
    });
    expect(service.list).toHaveBeenCalledWith("en");
  });

  it("lists another language", async () => {
    service.list.mockResolvedValue([]);
    await request(app.getHttpServer()).get("/mistakes?language=es");
    expect(service.list).toHaveBeenCalledWith("es");
  });

  it("rejects a language that is not a BCP 47 tag", async () => {
    const res = await request(app.getHttpServer()).get("/mistakes?language=English");
    expect(res.status).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });
});

describe("POST /mistakes/:id/dismiss", () => {
  it("dismisses the mistake with the reason", async () => {
    const res = await request(app.getHttpServer()).post(`/mistakes/${id}/dismiss`).send({ reason: "both_correct" });
    expect(res.status).toBe(204);
    expect(service.dismiss).toHaveBeenCalledWith(id, "both_correct");
  });

  it.each([
    ["a bad id", "not-a-uuid", { reason: "both_correct" }],
    ["no reason", id, {}],
    ["an unknown reason", id, { reason: "bored" }],
  ])("rejects %s", async (_case, mistakeId, body) => {
    const res = await request(app.getHttpServer()).post(`/mistakes/${mistakeId}/dismiss`).send(body);
    expect(res.status).toBe(400);
    expect(service.dismiss).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown mistake", async () => {
    service.dismiss.mockRejectedValue(new MistakeNotFoundError(id));
    const res = await request(app.getHttpServer()).post(`/mistakes/${id}/dismiss`).send({ reason: "not_needed" });
    expect(res.status).toBe(404);
  });
});
