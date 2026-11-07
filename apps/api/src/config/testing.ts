import type { ConfigService } from "@nestjs/config";
import { configFrom, type Env } from "./env.js";

/** The validated config with defaults, for unit tests of adapters. */
export function testConfig(values: Record<string, string> = {}): ConfigService<Env, true> {
  return configFrom({ DATABASE_URL: "postgres://voxa:voxa@localhost:5432/voxa_test", ...values });
}
