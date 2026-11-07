import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PracticeService } from "../application/practice.service.js";
import { applyHttpConventions } from "../common/http-app.js";
import { PracticeController } from "./practice.controller.js";

const service = { view: vi.fn() };
let app: INestApplication;

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await Test.createTestingModule({
    controllers: [PracticeController],
    providers: [{ provide: PracticeService, useValue: service }],
  }).compile();
  app = applyHttpConventions(mod.createNestApplication());
  await app.init();
});
afterEach(() => app.close());

describe("GET /practice", () => {
  it("returns the practice view for the language, English by default", async () => {
    service.view.mockResolvedValue({ patterns: [], newWords: [], earlier: [] });
    const res = await request(app.getHttpServer()).get("/practice");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ patterns: [], newWords: [], earlier: [] });
    expect(service.view).toHaveBeenCalledWith("en");
  });
});
