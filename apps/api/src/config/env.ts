import { ConfigService } from "@nestjs/config";
import { z } from "zod";

/** `KEY=` in a .env file means "not set", so the default applies. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === "" ? undefined : value), schema);

/** Each kind of Claude call. ANTHROPIC_TASKS can give any of them its own model or effort. */
export const CLAUDE_TASKS = [
  "tutor_open",
  "tutor_turn",
  "tutor_help",
  "review_cue",
  "review_check",
  "mission_model",
  "mission_expression",
  "memory",
  "check_in",
  "assess",
] as const;
export type ClaudeTask = (typeof CLAUDE_TASKS)[number];

const EFFORTS = ["low", "medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];

/** `task=model@effort` pairs, comma-separated; either side of `@` may be empty to keep the default. */
const TaskOverrides = z
  .string()
  .default("")
  .transform((value, ctx) => {
    const overrides: Partial<Record<ClaudeTask, { model?: string; effort?: Effort }>> = {};
    for (const entry of value.split(",").map((e) => e.trim()).filter(Boolean)) {
      const match = /^([a-z_]+)=([^@\s]*)(?:@([a-z]*))?$/.exec(entry);
      const task = match?.[1] as ClaudeTask | undefined;
      const effort = match?.[3] || undefined;
      if (!match || !task || !CLAUDE_TASKS.includes(task) || (effort && !EFFORTS.includes(effort as Effort))) {
        ctx.addIssue({ code: "custom", message: `Not a task=model@effort pair with a known task and effort: "${entry}"` });
        continue;
      }
      overrides[task] = { ...(match[2] ? { model: match[2] } : {}), ...(effort ? { effort: effort as Effort } : {}) };
    }
    return overrides;
  });

/** Every setting the API reads, with its default. Documented in .env.example. */
export const EnvSchema = z.object({
  API_PORT: optional(z.coerce.number().int().min(1).max(65535).default(3000)),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required, e.g. postgres://voxa:voxa@localhost:5432/voxa"),
  /** Read by the Anthropic SDK itself; optional so the app starts and shows "tutor unavailable" without it. */
  ANTHROPIC_API_KEY: optional(z.string().optional()),
  ANTHROPIC_MODEL: optional(z.string().default("claude-opus-5-5")),
  /** Thinking effort per turn. Low keeps spoken turns fast. */
  ANTHROPIC_EFFORT: optional(z.enum(EFFORTS).default("low")),
  /** Per-task model or effort, e.g. "review_check=claude-haiku-5-5@low". Unlisted tasks keep their default. */
  ANTHROPIC_TASKS: optional(TaskOverrides),
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
