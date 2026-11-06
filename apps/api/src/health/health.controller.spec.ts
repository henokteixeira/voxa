import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller.js";

describe("HealthController", () => {
  it("retorna ok", async () => {
    const mod = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    expect(mod.get(HealthController).check()).toEqual({ status: "ok" });
  });
});
