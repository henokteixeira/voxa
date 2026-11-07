import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.js";

const base = { DATABASE_URL: "postgres://voxa:voxa@localhost:5432/voxa" };

describe("validateEnv", () => {
  it("fills in the defaults, treating empty values as unset", () => {
    const env = validateEnv({ ...base, ANTHROPIC_EFFORT: "", VOICE_TIMEOUT_MS: "" });
    expect(env).toMatchObject({ API_PORT: 3000, ANTHROPIC_EFFORT: "low", VOICE_TIMEOUT_MS: 30_000 });
  });

  it("parses numbers", () => {
    expect(validateEnv({ ...base, API_PORT: "4000", VOICE_TIMEOUT_MS: "5000" })).toMatchObject({
      API_PORT: 4000,
      VOICE_TIMEOUT_MS: 5000,
    });
  });

  it("lists every invalid setting", () => {
    expect(() => validateEnv({ ANTHROPIC_EFFORT: "max", VOICE_SERVICE_URL: "localhost" })).toThrow(
      /DATABASE_URL[\s\S]*ANTHROPIC_EFFORT[\s\S]*VOICE_SERVICE_URL/,
    );
  });
});
