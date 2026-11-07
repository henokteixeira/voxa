import { ConfigService } from "@nestjs/config";
import { z } from "zod";

/** `KEY=` in a .env file means "not set", so the default applies. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === "" ? undefined : value), schema);

/** Every setting the API reads, with its default. Documented in .env.example. */
export const EnvSchema = z.object({
  API_PORT: optional(z.coerce.number().int().min(1).max(65535).default(3000)),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required, e.g. postgres://voxa:voxa@localhost:5432/voxa"),
  /** Read by the Anthropic SDK itself; optional so the app starts and shows "tutor unavailable" without it. */
  ANTHROPIC_API_KEY: optional(z.string().optional()),
  ANTHROPIC_MODEL: optional(z.string().default("claude-opus-5-5")),
  /** Thinking effort per turn. Low keeps spoken turns fast. */
  ANTHROPIC_EFFORT: optional(z.enum(["low", "medium", "high"]).default("low")),
  /** BCP 47. The tutor writes on-screen help in it. */
  LEARNER_FIRST_LANGUAGE: optional(z.string().default("pt-BR")),
  /** Relative to the API's working directory. Gitignored: it holds personal data. */
  TUTOR_CONTEXT_FILE: optional(z.string().default("../../tutor-context.md")),
  VOICE_SERVICE_URL: optional(z.url().default("http://localhost:8001")),
  VOICE_TIMEOUT_MS: optional(z.coerce.number().int().positive().default(30_000)),
  /** Extra STT wait per second of recorded speech: Whisper on CPU can take longer than the speech itself. */
  VOICE_STT_MS_PER_AUDIO_SECOND: optional(z.coerce.number().int().nonnegative().default(2_000)),
});

export type Env = z.infer<typeof EnvSchema>;

/** Parses the environment once at startup; a bad value stops the API with every problem listed. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid environment (see .env.example):\n${z.prettifyError(result.error)}`);
  return result.data;
}

/** A typed ConfigService over validated settings, for code that runs outside the Nest app (tests, scripts). */
export function configFrom(raw: Record<string, unknown>): ConfigService<Env, true> {
  return new ConfigService<Env, true>(validateEnv(raw));
}

/** For the golden and eval scripts: they call Claude but never the database. */
export function scriptConfig(raw: Record<string, unknown>): ConfigService<Env, true> {
  return configFrom({ DATABASE_URL: "unused://scripts-do-not-use-the-database", ...raw });
}
