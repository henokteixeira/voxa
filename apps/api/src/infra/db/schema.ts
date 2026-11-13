import { CEFR_LEVELS, DISMISS_REASONS, LEVEL_SOURCES, MODES, TRACK_STAGES } from "@voxa/contracts";
import { type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { SessionTiming } from "../../domain/conversation/fluency.js";
import { type PendingCorrection, SEVERITIES, TURN_ROLES } from "../../domain/conversation/types.js";
import { SUPPORT_STEPS } from "../../domain/level/speaking-level.js";
import type { TutorMemory } from "../../domain/memory/learner-fact.js";

/** `column in (...)`, from the list the code uses, so a value the code does not know cannot be saved. */
function oneOf(column: SQL | AnyPgColumn, values: readonly string[]): SQL {
  // Written into the DDL as is (DDL takes no parameters): only plain identifiers.
  const bad = values.find((value) => !/^[A-Za-z0-9_]+$/.test(value));
  if (bad !== undefined) throw new Error(`Not a plain value for a check: "${bad}"`);
  return sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;
}

// Every record carries its language (BCP 47 code, e.g. "en") to support other languages.

/**
 * The people who practice. There is one until login exists: the API uses that one (see learner.ts).
 * A learner's own records carry `learner_id`; records under one of them (a session's turns, ...) reach it through it.
 */
export const learners = pgTable("learners", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The learner who owns the record; deleting the learner deletes their records. */
const learnerId = () =>
  uuid("learner_id")
    .notNull()
    .references((): AnyPgColumn => learners.id, { onDelete: "cascade" });

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: learnerId(),
    language: varchar("language", { length: 16 }).notNull(),
    mode: varchar("mode", { length: 32 }).notNull(), // a Mode: free_talk, my_day, story, opinion, presentation, daily, review or placement
    /** The serious mistake the conversation is paused on, if any. */
    pending: jsonb("pending").$type<PendingCorrection>(),
    /** The words of each hint the learner answered with "I said it right": they get no hint again in this session. */
    withdrawnMistakes: text("withdrawn_mistakes").array().notNull().default(sql`'{}'::text[]`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** When the session last changed: a turn, the web app saving the timing, or its end. */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    /** Speaking time and pauses measured by the web app; null when the session ended without them. */
    timing: jsonb("timing").$type<SessionTiming>(),
    /** Goals of the mode the learner has covered so far. */
    coveredGoals: jsonb("covered_goals").$type<string[]>().notNull().default([]),
    /** When the tutor last asked whether to stop or keep going. */
    lastCheckInAt: timestamp("last_check_in_at", { withTimezone: true }),
    /** How much help the session gives (build_full | build_light | supported | conversation | demanding); null in placement. */
    supportStep: varchar("support_step", { length: 16 }),
    /** Words the tutor's last line gave the learner to say (a model sentence or a sentence start). */
    scaffold: text("scaffold"),
    /** The guided track (A1–A2): the stage (model | swap | extend | answer | again), null outside the track. */
    trackStage: varchar("track_stage", { length: 16 }),
    /** The goal the track is building (a goal id of the mode), null in free talk. */
    trackGoal: varchar("track_goal", { length: 32 }),
    /** Extra tries at the current stage. */
    trackTries: smallint("track_tries").notNull().default(0),
    /** The learner was stuck at the current goal's answer, so it was built from the model. */
    trackHelped: boolean("track_helped").notNull().default(false),
    /** Goals in a row answered alone, and stuck at the answer: they move the step between A1 and A2. */
    trackUnaidedStreak: smallint("track_unaided_streak").notNull().default(0),
    trackStuckStreak: smallint("track_stuck_streak").notNull().default(0),
    /** What the tutor remembered when the session started. */
    memory: jsonb("memory").$type<TutorMemory>().notNull().default({ facts: [], recentSessions: [] }),
    /** When what the learner said about themselves was saved to memory; null until then. */
    rememberedAt: timestamp("remembered_at", { withTimezone: true }),
    /** One sentence on what the learner talked about, for later sessions; null when there is nothing to recall. */
    recap: text("recap"),
    /** The daily mission this session is step 3 of; null outside a mission. */
    missionId: uuid("mission_id").references((): AnyPgColumn => missions.id, { onDelete: "set null" }),
  },
  (t) => [
    // Open sessions by last activity: the ones left idle are closed.
    index("sessions_open_last_active_at").on(t.lastActiveAt).where(sql`${t.endedAt} is null`),
    index("sessions_mission_id").on(t.missionId),
    index("sessions_learner_started_at").on(t.learnerId, t.startedAt),
    check("sessions_mode", oneOf(t.mode, MODES)),
    check("sessions_support_step", oneOf(t.supportStep, SUPPORT_STEPS)),
    check("sessions_track_stage", oneOf(t.trackStage, TRACK_STAGES)),
  ],
);

/** Mistakes from the bank the learner practices in a session, in the order they were chosen. */
export const sessionTargets = pgTable(
  "session_targets",
  {
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    language: varchar("language", { length: 16 }).notNull(),
    original: text("original").notNull(),
    correction: text("correction").notNull(),
    category: varchar("category", { length: 32 }).notNull(),
    /** The learner said it correctly in this session. */
    met: boolean("met").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.position] }), unique("session_targets_session_original").on(t.sessionId, t.original)],
);

export const turns = pgTable("turns", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  /** Insertion order. Timestamps can tie, so ordering never relies on them. */
  seq: bigserial("seq", { mode: "number" }).notNull(),
  role: varchar("role", { length: 16 }).notNull(), // user | assistant
  content: text("content").notNull(),
  /** Learner turns: answered words the tutor gave, or used the first language. Always false for the tutor's turns. */
  assisted: boolean("assisted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("turns_session_id_seq").on(t.sessionId, t.seq), check("turns_role", oneOf(t.role, TURN_ROLES))]);

/** The rules mistakes break. Many mistakes share one pattern; the learner reviews the pattern. */
export const patterns = pgTable(
  "patterns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    language: varchar("language", { length: 16 }).notNull(),
    /** Stable id within the language, in snake_case English. */
    key: varchar("key", { length: 64 }).notNull(),
    /** The mistake type (verb_tense, agreement, ...): the group the pattern is shown in. */
    category: varchar("category", { length: 32 }).notNull(),
    /** A short label in the language being learned. */
    name: text("name").notNull(),
    /** The rule in one line, in the learner's first language. */
    rule: text("rule").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("patterns_language_key").on(t.language, t.key)],
);

export const mistakes = pgTable("mistakes", {
  id: uuid("id").primaryKey().defaultRandom(),
  learnerId: learnerId(),
  language: varchar("language", { length: 16 }).notNull(),
  original: text("original").notNull(),
  correction: text("correction").notNull(),
  category: varchar("category", { length: 32 }).notNull(), // a MistakeType, new_word, or an older category (grammar, vocabulary)
  /** The rule it breaks; null for new words and for mistakes saved before patterns. */
  patternId: uuid("pattern_id").references(() => patterns.id, { onDelete: "set null" }),
  occurrences: integer("occurrences").notNull().default(1),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  /** Set when the learner says "This isn't a mistake": the record then leaves the bank for good. */
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  dismissReason: varchar("dismiss_reason", { length: 32 }), // transcript_error | both_correct | not_needed
}, (t) => [unique("mistakes_learner_language_original").on(t.learnerId, t.language, t.original), check("mistakes_dismiss_reason", oneOf(t.dismissReason, DISMISS_REASONS))]);

/** When each pattern, new word or expression comes back for review. Exactly one of the three subjects is set. */
export const reviewItems = pgTable(
  "review_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: learnerId(),
    language: varchar("language", { length: 16 }).notNull(),
    /** A pattern: patterns are shared, so each learner has their own review of it. */
    patternId: uuid("pattern_id").references(() => patterns.id, { onDelete: "cascade" }),
    /** A new word: its row in mistakes (category new_word). */
    newWordId: uuid("new_word_id")
      .unique()
      .references(() => mistakes.id, { onDelete: "cascade" }),
    /** An expression from a daily mission's model. */
    expressionId: uuid("expression_id")
      .unique()
      .references((): AnyPgColumn => missionExpressions.id, { onDelete: "cascade" }),
    /** Index in REVIEW_INTERVALS_DAYS of the wait before the next review. */
    step: smallint("step").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  },
  (t) => [
    unique("review_items_learner_pattern").on(t.learnerId, t.patternId),
    check("review_items_one_subject", sql`num_nonnulls(${t.patternId}, ${t.newWordId}, ${t.expressionId}) = 1`),
    index("review_items_due").on(t.learnerId, t.language, t.dueAt),
  ],
);

/** Each cue a review gave, so its answer is checked against what was asked, once. */
export const reviewCards = pgTable("review_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  language: varchar("language", { length: 16 }).notNull(),
  reviewItemId: uuid("review_item_id")
    .notNull()
    .references(() => reviewItems.id, { onDelete: "cascade" }),
  /** The sentence asked for, in the learner's first language. */
  cue: text("cue").notNull(),
  /** One way to say it in the language being learned. */
  answer: text("answer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  recalled: boolean("recalled"),
});

/** Each time a mistake shows up in a session. */
export const mistakeOccurrences = pgTable("mistake_occurrences", {
  id: uuid("id").primaryKey().defaultRandom(),
  mistakeId: uuid("mistake_id").notNull().references(() => mistakes.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  language: varchar("language", { length: 16 }).notNull(),
  /** Insertion order. Timestamps can tie, so ordering never relies on them. */
  seq: bigserial("seq", { mode: "number" }).notNull(),
  severity: varchar("severity", { length: 16 }).notNull(), // serious | minor
  selfCorrected: boolean("self_corrected").notNull().default(false),
  /** The learner's turn in the session (1 = first answer); null for rows saved before it was kept. */
  learnerTurn: integer("learner_turn"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("mistake_occurrences_mistake_id").on(t.mistakeId),
  index("mistake_occurrences_session_id").on(t.sessionId),
  check("mistake_occurrences_severity", oneOf(t.severity, SEVERITIES)),
]);

/**
 * Sessions in which the learner used the correct form of a mistake, after the latest time they made it.
 * Making the mistake again deletes its rows, so the status goes back to Open.
 */
export const mistakeCorrectUses = pgTable(
  "mistake_correct_uses",
  {
    mistakeId: uuid("mistake_id").notNull().references(() => mistakes.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mistakeId, t.sessionId] })],
);

/** The learner's speaking level over time, per language; the newest row is the current level. */
export const speakingLevels = pgTable("speaking_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  learnerId: learnerId(),
  language: varchar("language", { length: 16 }).notNull(),
  /** Insertion order. Timestamps can tie, so ordering never relies on them. */
  seq: bigserial("seq", { mode: "number" }).notNull(),
  level: varchar("level", { length: 2 }).notNull(), // A1 | A2 | B1 | B2 | C1 | C2
  source: varchar("source", { length: 16 }).notNull(), // placement | manual | step_change
  /** The learner's own sentences that back the estimate. */
  evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
  assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull(),
  /** The placement session that gave this level (at most one level per session); null otherwise. */
  sessionId: uuid("session_id")
    .unique()
    .references(() => sessions.id, { onDelete: "set null" }),
}, (t) => [index("speaking_levels_learner_language_seq").on(t.learnerId, t.language, t.seq), check("speaking_levels_level", oneOf(t.level, CEFR_LEVELS)), check("speaking_levels_source", oneOf(t.source, LEVEL_SOURCES))]);

/** Every daily practice time the learner chose, per language. A day is judged by the newest choice made by its end. */
export const dailyGoalSettings = pgTable(
  "daily_goal_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: learnerId(),
    language: varchar("language", { length: 16 }).notNull(),
    /** Insertion order. Timestamps can tie, so ordering never relies on them. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    minutesPerDay: smallint("minutes_per_day").notNull(),
    setAt: timestamp("set_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("daily_goal_settings_learner_language_seq").on(t.learnerId, t.language, t.seq),
    check("daily_goal_settings_minutes", sql`${t.minutesPerDay} in (15, 30, 45, 60)`),
  ],
);

/** The XP of one ended session. Its primary key makes awarding happen once, even when two ends race. */
export const sessionXp = pgTable(
  "session_xp",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => sessions.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 16 }).notNull(),
    total: integer("total").notNull(),
    /** The session's pace, kept to find personal records; null when it was not measured. */
    wordsPerMinute: integer("words_per_minute"),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("session_xp_language_awarded_at").on(t.language, t.awardedAt)],
);

/** What the session's XP is made of, one row per reason. */
export const xpAwards = pgTable(
  "xp_awards",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessionXp.sessionId, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 32 }).notNull(),
    count: integer("count").notNull(),
    points: integer("points").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.reason] }),
    check(
      "xp_awards_reason",
      sql`${t.reason} in ('practice_minute', 'goal_covered', 'self_corrected', 'personal_record')`,
    ),
  ],
);

/** The fluency signals of one ended practice session, to compare it with the ones before and show them over time. */
export const sessionSignals = pgTable(
  "session_signals",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => sessions.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 16 }).notNull(),
    mode: varchar("mode", { length: 32 }).notNull(),
    /** Insertion order. Timestamps can tie, so ordering never relies on them. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    // Each signal is null when the session gave nothing to measure it.
    unaidedShare: doublePrecision("unaided_share"),
    wordsPerMinute: integer("words_per_minute"),
    longPausesPerMinute: doublePrecision("long_pauses_per_minute"),
    averagePauseMs: integer("average_pause_ms"),
    mistakesPer100Words: doublePrecision("mistakes_per_100_words"),
    selfCorrectionRate: doublePrecision("self_correction_rate"),
    wordsPerAnswer: doublePrecision("words_per_answer"),
  },
  (t) => [index("session_signals_language_seq").on(t.language, t.seq)],
);

/** Facts the learner said about themselves. The tutor brings them up in later sessions. */
export const learnerFacts = pgTable(
  "learner_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: learnerId(),
    /** Insertion order. Timestamps can tie, so ordering never relies on them. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    topic: varchar("topic", { length: 16 }).notNull(), // work | projects | people | interests | life | goals
    statement: text("statement").notNull(),
    /** The language practiced in the session the fact came from. */
    language: varchar("language", { length: 16 }).notNull(),
    sourceSessionId: uuid("source_session_id").references(() => sessions.id, { onDelete: "set null" }),
    learnedAt: timestamp("learned_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("learner_facts_learner_seq").on(t.learnerId, t.seq)],
);

/** The "say it faster" rounds told after a session: the same content, with less time each round. */
export const fasterRounds = pgTable(
  "faster_rounds",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    round: smallint("round").notNull(), // 1 to 3: FASTER_ROUNDS is 2 since 2026-11-13, older sessions told 3
    language: varchar("language", { length: 16 }).notNull(),
    timeLimitMs: integer("time_limit_ms").notNull(),
    transcript: text("transcript").notNull(),
    spokenWords: integer("spoken_words").notNull(),
    speechMs: integer("speech_ms").notNull(),
    longPauses: smallint("long_pauses").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.round] }), check("faster_rounds_round", sql`${t.round} between 1 and 3`)],
);

/** Raw bytes (Postgres bytea), e.g. a recording. */
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value)),
});

/** The check-in every 2 weeks: the same task, compared over time. */
export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: learnerId(),
    /** Insertion order. Timestamps can tie, so ordering never relies on them. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    language: varchar("language", { length: 16 }).notNull(),
    task: varchar("task", { length: 32 }).notNull(), // present_project, or a topic of the second task
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    transcript: text("transcript").notNull(),
    spokenWords: integer("spoken_words").notNull(),
    speechMs: integer("speech_ms").notNull(),
    longPauses: smallint("long_pauses").notNull(),
    /** Null: the tutor could not read the transcript (or the check-in is older than this column). */
    mistakes: smallint("mistakes"),
    otherLanguageWords: smallint("other_language_words"),
  },
  (t) => [
    index("check_ins_learner_language_seq").on(t.learnerId, t.language, t.seq),
    // The fixed task and the topics of CHECK_IN_TOPICS (domain/check-in/check-in.ts).
    check(
      "check_ins_task",
      sql`${t.task} in ('present_project', 'last_weekend', 'problem_solved', 'explain_skill', 'change_wanted', 'place_remembered', 'person_admired', 'next_month', 'recommendation', 'childhood_memory', 'hard_decision')`,
    ),
  ],
);

/** Each check-in's recording, apart so that listing check-ins never loads audio. */
export const checkInRecordings = pgTable("check_in_recordings", {
  checkInId: uuid("check_in_id")
    .primaryKey()
    .references(() => checkIns.id, { onDelete: "cascade" }),
  mimeType: varchar("mime_type", { length: 64 }).notNull(),
  audio: bytea("audio").notNull(),
});

/** The daily mission: one situation a day, picked by rotation. */
export const missions = pgTable(
  "missions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: learnerId(),
    language: varchar("language", { length: 16 }).notNull(),
    /** The learner's local day. */
    day: date("day", { mode: "string" }).notNull(),
    situation: varchar("situation", { length: 32 }).notNull(), // a MissionSituation; the check below must follow it
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** Step 1's model, written the first time it is asked for: who speaks and what they say. */
    modelSpeaker: varchar("model_speaker", { length: 64 }),
    modelText: text("model_text"),
    /** When each step was done (step 1 listened once, step 2 the 3 expressions tried, step 5 the review). */
    listenedAt: timestamp("listened_at", { withTimezone: true }),
    expressionsDoneAt: timestamp("expressions_done_at", { withTimezone: true }),
    reviewDoneAt: timestamp("review_done_at", { withTimezone: true }),
    /** Step 4 ("say it faster") is optional: when the learner skipped it. */
    fasterSkippedAt: timestamp("faster_skipped_at", { withTimezone: true }),
  },
  (t) => [
    unique("missions_learner_language_day").on(t.learnerId, t.language, t.day),
    check("missions_situation", sql`${t.situation} in ('daily', 'my_day', 'presentation', 'story', 'review', 'opinion')`),
    check("missions_model", sql`(${t.modelSpeaker} is null) = (${t.modelText} is null)`),
  ],
);

/** The 3 expressions each mission's model gives. */
export const missionExpressions = pgTable(
  "mission_expressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(), // 1 to MISSION_EXPRESSIONS (3); the check below must follow it
    phrase: text("phrase").notNull(),
    example: text("example").notNull(),
    /** When the learner first used it in a sentence of their own (step 2). */
    saidAt: timestamp("said_at", { withTimezone: true }),
  },
  (t) => [unique("mission_expressions_mission_position").on(t.missionId, t.position), check("mission_expressions_position", sql`${t.position} between 1 and 3`)],
);

/** How long each stage of a voice turn took (measurements, not learning records). */
export const voiceTurnTimings = pgTable(
  "voice_turn_timings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** Null for a typed turn. */
    sttMs: integer("stt_ms"),
    tutorMs: integer("tutor_ms").notNull(),
    ttsMs: integer("tts_ms").notNull(),
    totalMs: integer("total_ms").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("voice_turn_timings_recorded_at").on(t.recordedAt)],
);

/** Every call to the AI model: tokens and time, to weigh models and efforts by cost and speed. */
export const modelCalls = pgTable(
  "model_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    task: varchar("task", { length: 32 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    effort: varchar("effort", { length: 8 }).notNull(),
    inputTokens: integer("input_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    durationMs: integer("duration_ms").notNull(),
    failed: boolean("failed").notNull(),
    calledAt: timestamp("called_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("model_calls_task_called_at").on(t.task, t.calledAt)],
);
