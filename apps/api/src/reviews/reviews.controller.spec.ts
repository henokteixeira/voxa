import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewService } from "../application/review.service.js";
import { applyHttpConventions } from "../common/http-app.js";
import { ReviewsController } from "./reviews.controller.js";

const service = { overview: vi.fn() };
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
