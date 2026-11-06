import { integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Todo registro carrega o idioma (código BCP 47, ex.: "en"), para suportar outros idiomas.

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  language: varchar("language", { length: 16 }).notNull(),
  mode: varchar("mode", { length: 32 }).notNull(), // work_scenario | free_talk | micro_fluency
  scenario: varchar("scenario", { length: 64 }), // daily | planning | review | presentation
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const turns = pgTable("turns", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
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
});
