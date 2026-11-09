import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyHttpConventions } from "../common/http-app.js";
import { FasterRoundsService } from "../application/faster-rounds.service.js";
import { FasterRoundsController } from "./faster-rounds.controller.js";

const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const service = { view: vi.fn(), record: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [FasterRoundsController],
    providers: [{ provide: FasterRoundsService, useValue: service }],
  }).compile();
  app = applyHttpConventions(mod.createNestApplication());
  await app.init();
});
afterEach(() => app.close());

describe("/sessions/:id/faster-rounds", () => {
  it("records a told round", async () => {
    const view = { rounds: [], nextRound: 2, nextLimitMs: 90_000, result: null };
    service.record.mockResolvedValue(view);
    const round = { round: 1, transcript: " I finished it ", speechMs: 5000, longPausesMs: [1200] };
    const res = await request(app.getHttpServer()).post(`/sessions/${id}/faster-rounds`).send(round);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(view);
    expect(service.record).toHaveBeenCalledWith(id, { ...round, transcript: "I finished it" });
  });

  it.each([[{ round: 0, transcript: "", speechMs: 0, longPausesMs: [] }], [{ round: 1, transcript: "x" }], [{ round: 1, transcript: "x", speechMs: 1000, longPausesMs: [1500] }]])("rejects %j", async (body) => {
    const res = await request(app.getHttpServer()).post(`/sessions/${id}/faster-rounds`).send(body);
    expect(res.status).toBe(400);
  });

  it("shows the rounds of a session", async () => {
    service.view.mockResolvedValue({ rounds: [], nextRound: 1, nextLimitMs: 120_000, result: null });
    const res = await request(app.getHttpServer()).get(`/sessions/${id}/faster-rounds`);
    expect(res.status).toBe(200);
    expect(service.view).toHaveBeenCalledWith(id);
  });
});
