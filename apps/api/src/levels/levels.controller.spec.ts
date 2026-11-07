import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LevelService } from "../application/level.service.js";
import { LevelsController } from "./levels.controller.js";

const service = { view: vi.fn(), setByHand: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [LevelsController],
    providers: [{ provide: LevelService, useValue: service }],
  }).compile();
  app = mod.createNestApplication();
  await app.init();
});
afterEach(() => app.close());

describe("GET /level", () => {
  it("returns the English level by default", async () => {
    service.view.mockResolvedValue({ current: null, placementDue: true });
    const res = await request(app.getHttpServer()).get("/level");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ current: null, placementDue: true });
    expect(service.view).toHaveBeenCalledWith("en");
  });

  it("passes the language through and rejects a bad one", async () => {
    service.view.mockResolvedValue({ current: null, placementDue: true });
    await request(app.getHttpServer()).get("/level?language=es");
    expect(service.view).toHaveBeenCalledWith("es");
    expect((await request(app.getHttpServer()).get("/level?language=English")).status).toBe(400);
  });
});

describe("PUT /level", () => {
  it("sets the level by hand", async () => {
    const view = { current: { language: "en", level: "B1", source: "manual", step: "supported" }, placementDue: true };
    service.setByHand.mockResolvedValue(view);
    const res = await request(app.getHttpServer()).put("/level").send({ language: "en", level: "B1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(view);
    expect(service.setByHand).toHaveBeenCalledWith("en", "B1");
  });

  it.each([{ level: "B3" }, { level: "b1" }, {}, { language: "English", level: "B1" }])("rejects %j", async (body) => {
    const res = await request(app.getHttpServer()).put("/level").send(body);
    expect(res.status).toBe(400);
    expect(service.setByHand).not.toHaveBeenCalled();
  });
});
