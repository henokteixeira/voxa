import type { Mode } from "../conversation/mode.js";

/** What a fact is about. Speaking practice covers life in general, not only work. */
export const FACT_TOPICS = ["work", "projects", "people", "interests", "life", "goals"] as const;

export type FactTopic = (typeof FACT_TOPICS)[number];

export function isFactTopic(value: unknown): value is FactTopic {
  return typeof value === "string" && (FACT_TOPICS as readonly string[]).includes(value);
}

/** Longest statement kept: a fact is one short sentence. */
export const MAX_FACT_LENGTH = 200;

/** Something true about the learner, said by them in a session. The tutor brings it up in later sessions. */
export interface LearnerFact {
  id: string;
  topic: FactTopic;
  /** One short sentence in English, in the third person: "Works as a software engineer." */
  statement: string;
  /** BCP 47: the language practiced in the session the fact came from. */
  language: string;
  /** The session the fact came from (or last changed in); null once that session is gone. */
  sourceSessionId: string | null;
  learnedAt: Date;
  updatedAt: Date;
}

export interface NewFact {
  topic: FactTopic;
  statement: string;
}

/** What one session taught about the learner. */
export interface SessionMemory {
  /** One sentence on what the learner talked about; null when they said nothing worth recalling. */
  recap: string | null;
  added: NewFact[];
  /** Known facts the session changed (a new job, a new project): the new statement replaces the old one. */
  updated: { id: string; statement: string }[];
}

/** An ended session as the tutor recalls it. */
export interface RecalledSession {
  mode: Mode;
  language: string;
  startedAt: Date;
  recap: string;
}

/** Trims statements, drops empty or too long ones, and keeps only updates of known facts. */
export function cleanMemory(memory: SessionMemory, knownIds: ReadonlySet<string>): SessionMemory {
  const clean = (s: string) => s.trim().replace(/\s+/g, " ");
  const fits = (s: string) => s.length > 0 && s.length <= MAX_FACT_LENGTH;
  const updated = new Map<string, string>();
  for (const u of memory.updated) {
    const statement = clean(u.statement);
    if (knownIds.has(u.id) && fits(statement)) updated.set(u.id, statement);
  }
  const added = new Map<string, NewFact>();
  for (const f of memory.added) {
    const statement = clean(f.statement);
    const key = statement.toLowerCase();
    if (fits(statement) && !added.has(key)) added.set(key, { topic: f.topic, statement });
  }
  const recap = memory.recap === null ? null : clean(memory.recap);
  return {
    recap: recap && recap.length <= MAX_FACT_LENGTH * 2 ? recap : null,
    added: [...added.values()],
    updated: [...updated].map(([id, statement]) => ({ id, statement })),
  };
}

/** What the tutor remembers when a session starts. */
export interface TutorMemory {
  facts: { topic: FactTopic; statement: string }[];
  /** The last sessions before this one, newest first. */
  recentSessions: { mode: Mode; daysAgo: number; recap: string }[];
}

export const NOTHING_REMEMBERED: TutorMemory = { facts: [], recentSessions: [] };

/** Whole calendar days (UTC) between two dates: 0 the same day, 1 the day before. */
export function daysBetween(earlier: Date, later: Date): number {
  const day = (d: Date) => Math.floor(d.getTime() / 86_400_000);
  return Math.max(0, day(later) - day(earlier));
}
