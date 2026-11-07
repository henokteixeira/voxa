import { sql } from "drizzle-orm";
import { bigserial, boolean, check, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { SessionTiming } from "../../domain/conversation/fluency.js";
import type { PendingCorrection, PracticeTarget } from "../../domain/conversation/types.js";

// Every record carries its language (BCP 47 code, e.g. "en") to support other languages.

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  language: varchar("language", { length: 16 }).notNull(),
  mode: varchar("mode", { length: 32 }).notNull(), // presentation | free_talk | daily | review | placement
  /** The serious mistake the conversation is paused on, if any. */
  pending: jsonb("pending").$type<PendingCorrection>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  /** Speaking time and pauses measured by the web app; null when the session ended without them. */
  timing: jsonb("timing").$type<SessionTiming>(),
  /** How ready the learner felt for this meeting type (1–5), before and after the session. */
  confidenceBefore: smallint("confidence_before"),
  confidenceAfter: smallint("confidence_after"),
  /** Goals of the mode the learner has covered so far. */
  coveredGoals: jsonb("covered_goals").$type<string[]>().notNull().default([]),
  /** When the tutor last asked whether to stop or keep going. */
  lastCheckInAt: timestamp("last_check_in_at", { withTimezone: true }),
  /** Mistakes from the bank the learner practices in this session. */
  targets: jsonb("targets").$type<PracticeTarget[]>().notNull().default([]),
  /** The `original` of each target the learner said correctly in this session. */
  metTargets: jsonb("met_targets").$type<string[]>().notNull().default([]),
});

export const turns = pgTable("turns", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  /** Insertion order. Timestamps can tie, so ordering never relies on them. */
  seq: bigserial("seq", { mode: "number" }).notNull(),
  role: varchar("role", { length: 16 }).notNull(), // user | assistant
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mistakes = pgTable("mistakes", {
  id: uuid("id").primaryKey().defaultRandom(),
  language: varchar("language", { length: 16 }).notNull(),
  original: text("original").notNull(),
  correction: text("correction").notNull(),
  category: varchar("category", { length: 32 }).notNull(), // grammar | vocabulary | pronunciation | ...
  occurrences: integer("occurrences").notNull().default(1),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  /** Set when the learner says "This isn't a mistake": the record then leaves the bank for good. */
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  dismissReason: varchar("dismiss_reason", { length: 32 }), // transcript_error | both_correct | not_needed
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
});

/** Every daily practice time the learner chose, per language. A day is judged by the newest choice made by its end. */
export const dailyGoalSettings = pgTable(
  "daily_goal_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    language: varchar("language", { length: 16 }).notNull(),
    /** Insertion order. Timestamps can tie, so ordering never relies on them. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    minutesPerDay: smallint("minutes_per_day").notNull(),
    setAt: timestamp("set_at", { withTimezone: true }).notNull(),
  },
  (t) => [check("daily_goal_settings_minutes", sql`${t.minutesPerDay} in (15, 30, 45, 60)`)],
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
