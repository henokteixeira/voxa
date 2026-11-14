import { z } from "zod";
import { MODES } from "./modes.js";

/** A BCP 47 language code, e.g. "en" or "pt-BR". */
export const Language = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
  .default("en");

const Ms = z.number().int().min(0).max(24 * 60 * 60 * 1000);

/** Speaking time and pauses the web app measured in a session. */
export const SessionTimingSchema = z.object({
  /** Total time the learner spoke. */
  learnerSpeechMs: Ms,
  /** Total time the tutor's voice played. */
  tutorSpeechMs: Ms,
  /** For each spoken answer: from the end of the tutor's voice to the start of the learner's speech. */
  pausesMs: z.array(Ms).max(5000),
  /** Silences of at least 1 s inside the learner's spoken answers. Missing in a timing measured before it existed. */
  longPausesMs: z.array(Ms).max(5000).optional(),
  /** Words the learner spoke (typed turns do not count). Missing in a timing measured before it existed. */
  spokenWords: z.number().int().min(0).max(1_000_000).optional(),
});
export type SessionTiming = z.infer<typeof SessionTimingSchema>;

/** POST /sessions */
export const StartSessionBody = z.object({
  mode: z.enum(MODES),
  language: Language,
  /** A daily mission's step 3: the session is that mission's conversation. */
  missionId: z.uuid().optional(),
  /** At B2, follow the step-by-step script anyway (a setting, off by default). Ignored at other levels. */
  guided: z.boolean().optional(),
});
export type StartSessionRequest = z.input<typeof StartSessionBody>;

/** POST /sessions/:id/turns */
export const TurnBody = z.object({ text: z.string().trim().min(1).max(2000) });

/** POST /sessions/:id/end. Without a timing (e.g. the learner left), the one saved during the session stays. */
export const EndSessionBody = z.object({ timing: SessionTimingSchema.optional() }).default({});
