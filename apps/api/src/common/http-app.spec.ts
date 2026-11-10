import { Controller, Get, type INestApplication, Logger, Query } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SessionNotFoundError } from "../domain/conversation/session-errors.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";
import { applyHttpConventions } from "./http-app.js";
import { parse } from "./http.js";

@Controller("probe")
class ProbeController {
  @Get("missing")
  missing() {
    throw new SessionNotFoundError("abc");
  }

  @Get("tutor")
  tutor() {
    throw new TutorUnavailableError("Claude API request failed: 529 overloaded");
  }

  @Get("bug")
  bug() {
    throw new TypeError("Cannot read properties of undefined (reading 'id')");
  }

  @Get("count")
  count(@Query() query: unknown) {
    return parse(z.object({ n: z.coerce.number().int() }), query);
  }
}

let app: INestApplication;
beforeAll(async () => {
  const mod = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
  app = applyHttpConventions(mod.createNestApplication({ logger: false }));
  await app.init();
});
afterAll(() => app.close());

describe("error answers", () => {
  it("maps a domain error to its status and public message", async () => {
    const res = await request(app.getHttpServer()).get("/probe/missing");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      code: "not_found",
      message: "Session not found.",
      requestId: res.headers["x-request-id"],
    });
  });

  it("keeps provider details out of the answer and in the logs", async () => {
    const logged = vi.spyOn(Logger.prototype, "error");
    const res = await request(app.getHttpServer()).get("/probe/tutor");
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ code: "tutor_unavailable", message: "The tutor is not available right now." });
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith(expect.stringMatching(/GET \/probe\/tutor 502 .*529 overloaded/)));
    logged.mockRestore();
  });

  it("answers a bug as a generic 500", async () => {
    const res = await request(app.getHttpServer()).get("/probe/bug");
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: "internal", message: "Something went wrong." });
  });

  it("answers invalid input with 400 and what was wrong", async () => {
    const res = await request(app.getHttpServer()).get("/probe/count?n=many");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid");
    expect(res.body.message).toContain("n");
  });

  it("answers an unknown route with not_found", async () => {
    const res = await request(app.getHttpServer()).get("/nowhere");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
  });
});

describe("request ids", () => {
  it("keeps the caller's id", async () => {
    const res = await request(app.getHttpServer()).get("/probe/count?n=1").set("x-request-id", "web-123");
    expect(res.headers["x-request-id"]).toBe("web-123");
  });

  it("replaces an id that could inject into the logs", async () => {
    const res = await request(app.getHttpServer()).get("/probe/count?n=1").set("x-request-id", "a b\tc");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
