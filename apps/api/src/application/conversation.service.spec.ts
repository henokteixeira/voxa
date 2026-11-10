import { InvalidInputError } from "../domain/errors.js";
import type { Mission } from "../domain/mission/mission.js";
import { MissionNotFoundError } from "../domain/mission/mission-errors.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorVerdict } from "../domain/conversation/correction-policy.js";
import type { Mode } from "../domain/conversation/mode.js";
import type {
  ChatTurn,
  Issue,
  PendingCorrection,
  PracticeTarget,
  Session,
  Severity,
} from "../domain/conversation/types.js";
import type { Clock } from "../domain/ports/clock.port.js";
import type { BankEntry } from "../domain/ports/mistake-bank.repository.js";
import type { LearnerContextPort } from "../domain/ports/learner-context.port.js";
import type { SpeakingLevel, SupportStep } from "../domain/level/speaking-level.js";
import type { LevelAssessorPort } from "../domain/ports/level-assessor.port.js";
import type { LevelRepository } from "../domain/ports/level.repository.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";
import type { Mistake, MistakeRepository, NewMistake, Occurrence, SessionMistake } from "../domain/ports/mistake.repository.js";
import type { SessionTiming } from "../domain/conversation/fluency.js";
import type { KnownPattern, MistakePattern } from "../domain/mistakes/pattern.js";
import type { ReviewRepository, ReviewSubject } from "../domain/ports/review.repository.js";
import type { ReviewState } from "../domain/review/review-schedule.js";
import { NOTHING_REMEMBERED, type TutorMemory } from "../domain/memory/learner-fact.js";
import type { LearnerMemoryService } from "./learner-memory.service.js";
import { ReviewScheduler } from "./review-scheduler.js";
import type { NewTurn, SessionProgress, SessionRepository } from "../domain/ports/session.repository.js";
import type { TrackPlan, TutorContext, TutorPort, TutorRequest } from "../domain/ports/tutor.port.js";
import { NEW_WORD_CATEGORY } from "../domain/conversation/types.js";
import type { TrackState } from "../domain/conversation/guided-track.js";
import { ConversationService, SessionEndedError, SessionNotFoundError, TurnConflictError, type TurnResult } from "./conversation.service.js";

class FakeTutor implements TutorPort {
  verdicts: TutorVerdict[] = [];
  opened: TutorContext[] = [];
  openPlans: (TrackPlan | null)[] = [];
  requests: TutorRequest[] = [];
  openingScaffold: string | null = null;
  async open(context: TutorContext, plan: TrackPlan | null = null) {
    this.opened.push(context);
    this.openPlans.push(plan);
    return { line: "Tell me about your project.", scaffold: this.openingScaffold };
  }
  /** False: behave like a tutor that cannot hand over its reply before the whole verdict. */
  speaksEarly = true;
  async evaluate(request: TutorRequest, onReply?: (reply: string) => void) {
    this.requests.push(request);
    const next = this.verdicts.shift();
    if (!next) throw new Error("No verdict queued");
    if (this.speaksEarly) onReply?.(next.reply);
    return next;
  }
}

type Row = Session & { turns: ChatTurn[]; timing: SessionTiming | null };

class FakeSessions implements SessionRepository {
  rows = new Map<string, Row>();
  async create(input: { language: string; mode: Mode; startedAt?: Date; targets?: PracticeTarget[]; step?: SupportStep | null; track?: TrackState | null; memory?: TutorMemory; missionId?: string | null }) {
    const id = `s${this.rows.size + 1}`;
    const session: Session = {
      id,
      language: input.language,
      mode: input.mode,
      pending: null,
      startedAt: input.startedAt ?? new Date(),
      endedAt: null,
      coveredGoals: [],
      lastCheckInAt: null,
      targets: input.targets ?? [],
      metTargets: [],
      step: input.step ?? null,
      scaffold: null,
      track: input.track ?? null,
      memory: input.memory ?? NOTHING_REMEMBERED,
      missionId: input.missionId ?? null,
    };
    this.rows.set(id, { ...session, turns: [], timing: null });
    return session;
  }
  async setProgress(id: string, progress: SessionProgress) {
    Object.assign(this.rows.get(id)!, progress);
  }
  async latestForMission(missionId: string) {
    return [...this.rows.values()].filter((r) => r.missionId === missionId).pop() ?? null;
  }
  async get(id: string) {
    const row = this.rows.get(id);
    if (!row) return null;
    const { turns: _t, timing: _ti, ...session } = row;
    return session;
  }
  /** Whether each learner turn was helped, in order. */
  assisted = new Map<string, boolean[]>();
  async claimTurn(id: string, turnsSeen: number) {
    const row = this.rows.get(id)!;
    if (row.endedAt) return "ended" as const;
    return row.turns.length === turnsSeen ? ("claimed" as const) : ("taken" as const);
  }
  async appendTurn(id: string, { assisted, ...turn }: NewTurn) {
    this.rows.get(id)!.turns.push(turn);
    if (turn.role === "user") this.assisted.set(id, [...(this.assisted.get(id) ?? []), assisted ?? false]);
  }
  async history(id: string) {
    return [...this.rows.get(id)!.turns];
  }
  async setPending(id: string, pending: PendingCorrection | null) {
    this.rows.get(id)!.pending = pending;
  }
  async end(id: string, timing: SessionTiming | null) {
    Object.assign(this.rows.get(id)!, { endedAt: new Date(), timing });
  }
  async outcome(id: string) {
    const row = this.rows.get(id);
    if (!row) return null;
    const helped = this.assisted.get(id) ?? [];
    return {
      timing: row.timing,
      learnerTurns: { total: helped.length, assisted: helped.filter(Boolean).length },
    };
  }
}

class FakeReviews implements Pick<ReviewRepository, "state" | "save" | "schedules"> {
  items = new Map<string, ReviewState & { language: string }>();
  async state(subject: ReviewSubject) {
    const item = this.items.get(`${subject.kind}:${subject.id}`);
    return item ? { step: item.step, dueAt: item.dueAt } : null;
  }
  async save(language: string, subject: ReviewSubject, state: ReviewState) {
    this.items.set(`${subject.kind}:${subject.id}`, { language, ...state });
  }
  async schedules(language: string) {
    return [...this.items]
      .filter(([, item]) => item.language === language)
      .map(([key, { step, dueAt }]) => {
        const [kind, id] = key.split(":") as ["pattern" | "new_word", string];
        return { subject: { kind, id }, step, dueAt };
      });
  }
}

class FakeMistakes implements MistakeRepository {
  bank: (Mistake & { pattern: MistakePattern | null })[] = [];
  events: { sessionId: string; original: string; severity: Severity; selfCorrected: boolean }[] = [];
  /** The learner turn of each event, by index. */
  turns = new Map<number, number | undefined>();
  async record(m: NewMistake, o: Occurrence) {
    let saved = this.bank.find((b) => b.language === m.language && b.original === m.original);
    if (saved) saved.occurrences += 1;
    else {
      const patternId = m.pattern ? `p-${m.pattern.key}` : null;
      saved = { id: `m${this.bank.length + 1}`, ...m, occurrences: 1, lastSeenAt: new Date(), patternId };
      this.bank.push(saved);
    }
    this.events.push({ sessionId: o.sessionId, original: m.original, severity: o.severity, selfCorrected: false });
    this.turns.set(this.events.length - 1, o.learnerTurn);
    return saved;
  }
  correctUses: { sessionId: string; language: string; original: string }[] = [];
  async recordCorrectUse(sessionId: string, mistake: { language: string; original: string }) {
    this.correctUses.push({ sessionId, ...mistake });
    return this.bank.find((b) => b.language === mistake.language && b.original === mistake.original) ?? null;
  }
  async markSelfCorrected(sessionId: string, mistake: { language: string; original: string }) {
    const latest = this.events.findLast((e) => e.sessionId === sessionId && e.original === mistake.original);
    if (latest) latest.selfCorrected = true;
  }
  async mostFrequent(language: string, limit: number) {
    return this.bank
      .filter((m) => m.language === language)
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, limit);
  }
  async forSession(sessionId: string): Promise<SessionMistake[]> {
    return this.events
      .filter((e) => e.sessionId === sessionId)
      .map((e) => {
        const m = this.bank.find((b) => b.original === e.original)!;
        return {
          original: m.original,
          correction: m.correction,
          category: m.category,
          severity: e.severity,
          selfCorrected: e.selfCorrected,
          occurrences: m.occurrences,
          pattern: m.pattern,
          patternId: m.patternId,
          patternSeenBefore:
            m.patternId !== null &&
            this.events.some(
              (o) => o.sessionId !== sessionId && this.bank.find((b) => b.original === o.original)?.patternId === m.patternId,
            ),
        };
      });
  }
  async sessionPatterns(sessionId: string) {
    const last = new Map<string, { key: string; name: string; lastTurn: number }>();
    this.events.forEach((e, i) => {
      const turn = this.turns.get(i);
      const pattern = this.bank.find((b) => b.original === e.original)?.pattern;
      if (e.sessionId === sessionId && turn !== undefined && pattern) {
        last.set(pattern.key, { key: pattern.key, name: pattern.name, lastTurn: turn });
      }
    });
    return [...last.values()];
  }
  async patterns(language: string, limit: number): Promise<KnownPattern[]> {
    const seen = this.bank.filter((m) => m.language === language && m.pattern).map((m) => m.pattern!);
    return [...new Map(seen.map((p) => [p.key, { key: p.key, name: p.name }])).values()].slice(0, limit);
  }
}

class FakeLevels implements LevelRepository {
  rows: SpeakingLevel[] = [];
  readonly bySession = new Map<string, SpeakingLevel>();
  async addForSession(sessionId: string, level: SpeakingLevel) {
    const existing = this.bySession.get(sessionId);
    if (existing) return existing;
    this.bySession.set(sessionId, level);
    this.rows.push(level);
    return level;
  }
  async forSession(sessionId: string) {
    return this.bySession.get(sessionId) ?? null;
  }
  async add(level: SpeakingLevel) {
    this.rows.push(level);
  }
  async current(language: string) {
    return this.rows.filter((r) => r.language === language).at(-1) ?? null;
  }
  async lastPlacementAt(language: string) {
    return this.rows.filter((r) => r.language === language && r.source === "placement").at(-1)?.assessedAt ?? null;
  }
}

class FakeAssessor implements LevelAssessorPort {
  calls: Parameters<LevelAssessorPort["assess"]>[0][] = [];
  failure: Error | null = null;
  async assess(input: Parameters<LevelAssessorPort["assess"]>[0]) {
    this.calls.push(input);
    if (this.failure) throw this.failure;
    return { level: "A2" as const, evidence: ["Yesterday I fix the upload"] };
  }
}

const learnerContext: LearnerContextPort = { load: async () => "Works on Oral Collector." };

const goed: Issue = {
  original: "I goed to the meeting",
  correction: "I went to the meeting",
  category: "grammar",
  severity: "serious",
  hint: "Check the past tense of 'go'.",
  matchesKnownMistake: false,
  pattern: null,
};
const article: Issue = {
  original: "I opened PR",
  correction: "I opened a PR",
  category: "grammar",
  severity: "minor",
  hint: "Something small is missing before 'PR'.",
  matchesKnownMistake: false,
  pattern: null,
};
const articlesPattern = { key: "articles_before_nouns", name: "Articles before nouns", rule: "Use a/the antes do substantivo." };
const verdict = (v: Partial<TutorVerdict>): TutorVerdict => ({
  reply: "Nice. What happened next?",
  issues: [],
  pendingResolved: false,
  nextHint: null,
  correctUses: [],
  newWords: [],
  support: null,
  coveredGoals: [],
  stuck: false,
  scaffold: null,
  ...v,
});

class FakeClock implements Clock {
  time = new Date("2026-11-07T10:00:00Z");
  now() {
    return new Date(this.time);
  }
  advanceMinutes(n: number) {
    this.time = new Date(this.time.getTime() + n * 60_000);
  }
}

const entry = (over: Partial<BankEntry>): BankEntry => ({
  id: "b1",
  language: "en",
  original: "I goed",
  correction: "I went",
  category: "grammar",
  occurrences: 1,
  lastSeenAt: new Date(),
  sessionsCorrect: 0,
  pattern: null,
  patternId: null,
  ...over,
});

const remembered = {
  facts: [{ topic: "work", statement: "Works as a developer." }],
  recentSessions: [{ mode: "daily", daysAgo: 1, recap: "Fixed the upload bug." }],
};

let tutor: FakeTutor;
let reviews: FakeReviews;
let sessions: FakeSessions;
let mistakes: FakeMistakes;
let service: ConversationService;
let clock: FakeClock;
let bankEntries: BankEntry[];
let levels: FakeLevels;
let assessor: FakeAssessor;
let missionRows: Mission[];
let memory: { rememberLater: ReturnType<typeof vi.fn>; sweep: ReturnType<typeof vi.fn>; recall: ReturnType<typeof vi.fn> };

beforeEach(() => {
  tutor = new FakeTutor();
  sessions = new FakeSessions();
  mistakes = new FakeMistakes();
  clock = new FakeClock();
  bankEntries = [];
  const bank = { list: async (language: string) => bankEntries.filter((e) => e.language === language) };
  levels = new FakeLevels();
  assessor = new FakeAssessor();
  reviews = new FakeReviews();
  memory = {
    rememberLater: vi.fn().mockResolvedValue(undefined),
    sweep: vi.fn().mockResolvedValue(undefined),
    recall: vi.fn().mockResolvedValue(remembered),
  };
  missionRows = [];
  const missions = {
    get: async (id: string) => missionRows.find((m) => m.id === id) ?? null,
  };
  service = new ConversationService(
    tutor,
    sessions,
    mistakes,
    learnerContext,
    bank,
    clock,
    assessor,
    levels,
    new ReviewScheduler(reviews),
    memory as unknown as LearnerMemoryService,
    missions,
    // Rolls the fakes back when the work fails, like a transaction (the database test checks the real one).
    {
      run: async (work) => {
        const saved = structuredClone({ rows: sessions.rows, assisted: sessions.assisted, events: mistakes.events, bank: mistakes.bank });
        try {
          return await work({ sessions, mistakes, reviews: reviews as unknown as ReviewRepository });
        } catch (error) {
          Object.assign(sessions, { rows: saved.rows, assisted: saved.assisted });
          Object.assign(mistakes, { events: saved.events, bank: saved.bank });
          throw error;
        }
      },
    },
  );
});

describe("ConversationService.start in a daily mission", () => {
  const mission = (over: Partial<Mission> = {}): Mission => ({
    id: "m1",
    language: "en",
    day: "2026-11-09",
    situation: "daily",
    createdAt: new Date(),
    model: {
      speaker: "Alex",
      text: "...",
      expressions: ["I'm still working on…", "I'm blocked by…", "By the end of the day, I'll…"].map((phrase, i) => ({
        id: `e${i + 1}`,
        position: i + 1,
        phrase,
        example: phrase,
        saidAt: null,
      })),
    },
    listenedAt: null,
    expressionsDoneAt: null,
    reviewDoneAt: null,
    ...over,
  });

  it("links the conversation to the mission and gives the tutor its 3 expressions, all session long", async () => {
    missionRows.push(mission());
    const { session } = await service.start("daily", "en", "m1");
    expect((await sessions.get(session.id))?.missionId).toBe("m1");
    const phrases = ["I'm still working on…", "I'm blocked by…", "By the end of the day, I'll…"];
    expect(tutor.opened[0].expressions).toEqual(phrases);

    tutor.verdicts.push(verdict({}));
    await service.respond(session.id, "Hi");
    expect(tutor.requests[0].expressions).toEqual(phrases);
  });

  it("gives no expressions outside a mission", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({}));
    await service.respond(session.id, "Hi");
    expect(tutor.opened[0].expressions).toBeUndefined();
    expect(tutor.requests[0].expressions).toBeUndefined();
  });

  it("refuses a mission of another situation and an unknown one", async () => {
    missionRows.push(mission());
    await expect(service.start("story", "en", "m1")).rejects.toBeInstanceOf(InvalidInputError);
    await expect(service.start("daily", "en", "m9")).rejects.toBeInstanceOf(MissionNotFoundError);
  });
});

describe("ConversationService.start", () => {
  it("gives the tutor what it remembered at the start, all session long", async () => {
    const { session } = await service.start("free_talk", "en");
    // A memory saved mid-session (another session's background run) does not change this one's prompt.
    memory.recall.mockResolvedValue({ facts: [], recentSessions: [] });
    tutor.verdicts.push(verdict({}));
    await service.respond(session.id, "Hi");

    const stored = await sessions.get(session.id);
    expect(memory.recall).toHaveBeenCalledTimes(1);
    expect(memory.recall).toHaveBeenCalledWith({ startedAt: stored?.startedAt });
    expect(tutor.opened[0]).toEqual(expect.objectContaining({ memory: remembered }));
    expect(tutor.requests[0]).toEqual(expect.objectContaining({ memory: remembered }));
  });

  it("picks up sessions left unremembered", async () => {
    await service.start("daily", "en");
    expect(memory.sweep).toHaveBeenCalledTimes(1);
  });

  it("opens the scene for the mode with the learner's context and saves the first line", async () => {
    const { session, message } = await service.start("presentation", "en");

    expect(tutor.opened).toEqual([
      expect.objectContaining({ mode: "presentation", language: "en", learnerContext: "Works on Oral Collector." }),
    ]);
    expect(message).toBe("Tell me about your project.");
    expect(await sessions.history(session.id)).toEqual([{ role: "assistant", content: message }]);
  });

  it("returns the mode's goals and gives them to the tutor", async () => {
    const { goals } = await service.start("daily", "en");
    expect(goals).toEqual(["yesterday", "today", "blockers"]);
    expect(tutor.opened[0].goals.map((g) => g.id)).toEqual(["yesterday", "today", "blockers"]);
    expect((await service.start("free_talk", "en")).goals).toEqual([]);
  });

  it("practices the two most frequent mistakes not mastered yet, never a new word", async () => {
    bankEntries = [
      entry({ original: "rare", occurrences: 1 }),
      entry({ original: "mastered", occurrences: 9, sessionsCorrect: 3 }),
      entry({ original: "a word", occurrences: 8, category: NEW_WORD_CATEGORY }),
      entry({ original: "improving", occurrences: 5, sessionsCorrect: 1 }),
      entry({ original: "open", occurrences: 4 }),
      entry({ original: "other language", occurrences: 7, language: "es" }),
    ];
    const { session } = await service.start("daily", "en");
    expect(session.targets.map((t) => t.original)).toEqual(["improving", "open"]);
    expect(tutor.opened[0].targets.map((t) => t.original)).toEqual(["improving", "open"]);
  });

  it("practices the patterns due for review first", async () => {
    bankEntries = [
      entry({ original: "often", occurrences: 9, patternId: "p-later" }),
      entry({ original: "due", occurrences: 2, patternId: "p-due" }),
      entry({ original: "also often", occurrences: 8 }),
    ];
    reviews.items.set("pattern:p-due", { language: "en", step: 1, dueAt: clock.now() });
    reviews.items.set("pattern:p-later", { language: "en", step: 1, dueAt: new Date(clock.now().getTime() + 86_400_000) });

    const { session } = await service.start("daily", "en");
    expect(session.targets.map((t) => t.original)).toEqual(["due", "often"]);
  });
});

describe("Session goals", () => {
  it("keeps the goals the tutor reports, only the mode's", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ coveredGoals: ["yesterday", "status"] }), verdict({ coveredGoals: ["today"] }));

    expect((await service.respond(session.id, "Yesterday I fixed a bug.")).coveredGoals).toEqual(["yesterday"]);
    const second = await service.respond(session.id, "Today I will test it.");

    expect(second.coveredGoals).toEqual(["yesterday", "today"]);
    expect(tutor.requests[1].coveredGoals).toEqual(["yesterday"]);
    expect(second.checkIn).toBe(false);
  });

  it("asks whether to stop once every goal is covered", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ reply: "Thanks.", coveredGoals: ["yesterday", "today", "blockers"] }));

    const result = await service.respond(session.id, "Yesterday tests, today deploy, no blockers.");

    expect(result.checkIn).toBe(true);
    expect(result.message).toBe("Thanks. We've covered everything for this conversation. Do you want to stop here or keep going?");
    expect((await sessions.history(session.id)).at(-1)?.content).toBe(result.message);
  });

  it("asks in free talk after 8 minutes, then again every 5 minutes", async () => {
    const { session } = await service.start("free_talk", "en");
    tutor.verdicts.push(verdict({}), verdict({}), verdict({}), verdict({}));

    clock.advanceMinutes(7);
    expect((await service.respond(session.id, "Hi")).checkIn).toBe(false);
    clock.advanceMinutes(1);
    expect((await service.respond(session.id, "Hi")).checkIn).toBe(true);
    clock.advanceMinutes(4);
    expect((await service.respond(session.id, "Hi")).checkIn).toBe(false);
    clock.advanceMinutes(1);
    expect((await service.respond(session.id, "Hi")).message).toContain("We've been talking for a while.");
  });

  it("never asks on a turn that gives a hint", async () => {
    const { session } = await service.start("free_talk", "en");
    clock.advanceMinutes(9);
    tutor.verdicts.push(verdict({ issues: [goed] }), verdict({ pendingResolved: true }));

    expect((await service.respond(session.id, "I goed to the meeting")).checkIn).toBe(false);
    expect((await service.respond(session.id, "I went to the meeting")).checkIn).toBe(true);
  });

  it("counts a target met when said right without a hint, even after making the mistake this session", async () => {
    bankEntries = [entry({ original: "I goed", occurrences: 3 }), entry({ original: "more better", correction: "better" })];
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(
      verdict({ issues: [{ ...goed, original: "I goed", correction: "I went" }] }),
      verdict({ pendingResolved: true, correctUses: ["I goed"] }),
      verdict({ correctUses: ["I goed", "more better", "not a target"] }),
      verdict({ issues: [{ ...article, original: "more better", correction: "better" }] }),
    );
    await service.respond(session.id, "I goed there");
    await service.respond(session.id, "I went there");
    expect((await sessions.get(session.id))?.metTargets).toEqual([]); // the retry after a hint does not count
    await service.respond(session.id, "Then I went home, it was better");
    await service.respond(session.id, "more better");

    expect((await service.end(session.id)).targets.map((t) => [t.original, t.met])).toEqual([
      ["I goed", true],
      ["more better", true],
    ]);
  });

  it("watches a target outside the known mistakes list once, by its exact text", async () => {
    bankEntries = [entry({ original: "I goed", occurrences: 3 })];
    mistakes.bank.push({ id: "m1", language: "en", original: "I goed", correction: "I went", category: "grammar", occurrences: 3, lastSeenAt: new Date(), pattern: null, patternId: null });
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({}));
    tutor.verdicts.push(verdict({}));
    await service.respond(session.id, "Hi");
    expect(tutor.requests[0].knownMistakes.filter((m) => m.original === "I goed")).toHaveLength(1);
  });

  it("shows covered goals and met targets in the summary", async () => {
    bankEntries = [entry({ original: "I goed", occurrences: 3 }), entry({ original: "more better", correction: "better" })];
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ coveredGoals: ["yesterday"], correctUses: ["I goed"] }));
    await service.respond(session.id, "Yesterday I went to the office.");

    const summary = await service.end(session.id);

    expect(summary.goals).toEqual([
      { id: "yesterday", covered: true },
      { id: "today", covered: false },
      { id: "blockers", covered: false },
    ]);
    expect(summary.targets.map((t) => [t.original, t.met])).toEqual([
      ["I goed", true],
      ["more better", false],
    ]);
  });
});

describe("ConversationService.respond", () => {
  it("keeps talking and only records a minor mistake", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [article] }));

    const result = await service.respond(session.id, "I opened PR");

    expect(result).toMatchObject({ kind: "reply", message: "Nice. What happened next?", selfCorrected: false, support: null });
    expect(mistakes.events).toEqual([
      { sessionId: session.id, original: "I opened PR", severity: "minor", selfCorrected: false },
    ]);
    expect((await sessions.get(session.id))?.pending).toBeNull();
  });

  it("pauses on a serious mistake with a hint and remembers it as pending", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }));

    const result = await service.respond(session.id, "I goed to the meeting");

    expect(result.kind).toBe("hint");
    expect(result.message).toBe("Check the past tense of 'go'.");
    expect((await sessions.get(session.id))?.pending).toMatchObject({ original: goed.original, hintsGiven: 1 });
    expect(mistakes.events[0].severity).toBe("serious");
  });

  it("records the pattern a mistake breaks, with a clean key, and shows the tutor the bank's patterns", async () => {
    const { session } = await service.start("daily", "en");
    const pattern = { key: " Past Simple ", name: "Past for finished actions", rule: "Ação terminada: passado." };
    tutor.verdicts.push(verdict({ issues: [{ ...article, pattern }] }), verdict({}));

    await service.respond(session.id, "I opened PR");
    await service.respond(session.id, "Then I left");

    expect(mistakes.bank[0].pattern).toEqual({ ...pattern, key: "past_simple" });
    expect(tutor.requests[1].knownPatterns).toEqual([{ key: "past_simple", name: "Past for finished actions" }]);
  });

  describe("a minor mistake that is already in the bank", () => {
    const articles = { key: "articles_before_nouns", name: "Articles before nouns", rule: "Use a/the antes do substantivo." };
    const known = { ...article, matchesKnownMistake: true, pattern: articles };
    beforeEach(() => {
      bankEntries = [entry({ original: "I opened PR", patternId: "p-articles", pattern: articles })];
    });

    it("pauses with a hint when its pattern is due for review, and records it as serious", async () => {
      reviews.items.set("pattern:p-articles", { language: "en", step: 1, dueAt: clock.now() });
      const { session } = await service.start("daily", "en");
      tutor.verdicts.push(verdict({ issues: [known] }));

      const result = await service.respond(session.id, "I opened PR");

      expect(result.kind).toBe("hint");
      expect(mistakes.events[0].severity).toBe("serious");
    });

    it("pauses when it is one of the session's practice targets", async () => {
      const { session } = await service.start("daily", "en");
      expect(session.targets.map((t) => t.original)).toEqual(["I opened PR"]);
      tutor.verdicts.push(verdict({ issues: [known] }));

      expect((await service.respond(session.id, "I opened PR")).kind).toBe("hint");
    });

    it("is only recorded when its pattern is not in focus", async () => {
      bankEntries.push(entry({ id: "b2", original: "I goed", occurrences: 5 }), entry({ id: "b3", original: "more better", occurrences: 4 }));
      const { session } = await service.start("daily", "en");
      tutor.verdicts.push(verdict({ issues: [known] }));

      const result = await service.respond(session.id, "I opened PR");

      expect(result.kind).toBe("reply");
      expect(mistakes.events[0].severity).toBe("minor");
    });

    it("tells the tutor which patterns pause, until the pattern is broken in the session", async () => {
      reviews.items.set("pattern:p-articles", { language: "en", step: 1, dueAt: clock.now() });
      const { session } = await service.start("daily", "en");
      tutor.verdicts.push(verdict({ issues: [known] }), verdict({ pendingResolved: true }));
      await service.respond(session.id, "I opened PR");
      await service.respond(session.id, "I opened a PR");

      expect(tutor.requests[0].focusPatterns).toEqual([{ key: "articles_before_nouns", name: "Articles before nouns" }]);
      expect(tutor.requests[1].focusPatterns).toEqual([]);
    });

    it("still pauses on a serious mistake of a pattern already broken in the session", async () => {
      reviews.items.set("pattern:p-articles", { language: "en", step: 1, dueAt: clock.now() });
      const { session } = await service.start("daily", "en");
      tutor.verdicts.push(verdict({ issues: [known] }), verdict({ pendingResolved: true }), verdict({ issues: [{ ...known, severity: "serious", original: "I merged PR" }] }));
      await service.respond(session.id, "I opened PR");
      await service.respond(session.id, "I opened a PR");

      expect((await service.respond(session.id, "I merged PR")).kind).toBe("hint");
    });

    it("pauses only the first time in the session", async () => {
      reviews.items.set("pattern:p-articles", { language: "en", step: 1, dueAt: clock.now() });
      const { session } = await service.start("daily", "en");
      tutor.verdicts.push(verdict({ issues: [known] }), verdict({ pendingResolved: true }), verdict({ issues: [{ ...known, original: "I merged PR", correction: "I merged a PR" }] }));
      await service.respond(session.id, "I opened PR");
      await service.respond(session.id, "I opened a PR");

      expect((await service.respond(session.id, "I merged PR")).kind).toBe("reply");
    });
  });

  it("passes history, the pending correction and known mistakes to the tutor", async () => {
    const { session } = await service.start("review", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }), verdict({ pendingResolved: true }));
    await service.respond(session.id, "I goed to the meeting");

    await service.respond(session.id, "I went to the meeting");

    const request = tutor.requests[1];
    expect(request.utterance).toBe("I went to the meeting");
    expect(request.pending).toMatchObject({ original: goed.original, hintsGiven: 1 });
    expect(request.knownMistakes).toEqual([
      { original: goed.original, correction: goed.correction, category: "grammar" },
    ]);
    expect(request.history.map((t) => t.role)).toEqual(["assistant", "user", "assistant"]);
  });

  it("marks a self-correction and goes back to the conversation", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }), verdict({ pendingResolved: true }));
    await service.respond(session.id, "I goed to the meeting");

    const result = await service.respond(session.id, "I went to the meeting");

    expect(result).toMatchObject({ kind: "reply", message: "Nice. What happened next?", selfCorrected: true, support: null });
    expect(mistakes.events[0].selfCorrected).toBe(true);
    expect((await sessions.get(session.id))?.pending).toBeNull();
  });

  it("does not record the pending mistake again while the learner retries", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(
      verdict({ issues: [goed] }),
      verdict({ issues: [goed], nextHint: "Think of 'go, ___, gone'." }),
    );
    await service.respond(session.id, "I goed to the meeting");

    const result = await service.respond(session.id, "I goed to the meeting");

    expect(result).toMatchObject({
      kind: "hint",
      message: "Think of 'go, ___, gone'.",
      selfCorrected: false,
      support: null,
      mistake: goed.original,
    });
    expect(mistakes.events).toHaveLength(1);
  });

  it("treats a retry with different case or end punctuation as the same pending mistake", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(
      verdict({ issues: [goed] }),
      verdict({ issues: [{ ...goed, original: "I Goed to the meeting.", correction: "I went to the meeting." }] }),
    );
    await service.respond(session.id, "I goed to the meeting");

    await service.respond(session.id, "I Goed to the meeting.");

    expect(mistakes.events).toHaveLength(1);
  });

  it("records a known mistake as serious even when a correction is already pending", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(
      verdict({ issues: [goed] }),
      verdict({ issues: [goed, { ...article, matchesKnownMistake: true, pattern: articlesPattern }] }),
    );
    bankEntries = [entry({ original: "I opened PR", patternId: "p-articles", pattern: articlesPattern })];
    reviews.items.set("pattern:p-articles", { language: "en", step: 1, dueAt: clock.now() });
    await service.respond(session.id, "I goed to the meeting");

    await service.respond(session.id, "I goed to the meeting and I opened PR");

    expect(mistakes.events.map((e) => [e.original, e.severity])).toEqual([
      [goed.original, "serious"],
      [article.original, "serious"],
    ]);
  });

  it("shows the correct form after two hints and asks the learner to repeat it", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(
      verdict({ issues: [goed] }),
      verdict({ issues: [goed], nextHint: "Think of 'go, ___, gone'." }),
      verdict({ issues: [goed] }),
    );
    await service.respond(session.id, "I goed to the meeting");
    await service.respond(session.id, "I goed to the meeting");

    const result = await service.respond(session.id, "I goed to the meeting");

    expect(result.kind).toBe("reveal");
    expect(result.message).toContain("I went to the meeting");
    expect((await sessions.get(session.id))?.pending).toMatchObject({ revealed: true });
  });

  it("names the mistake's type on every hint, and gives its rule only with the correct form", async () => {
    const pattern = { key: "past_simple", name: "Past for finished actions", rule: "Ação terminada: passado (go → went)." };
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [{ ...goed, pattern }] }), verdict({ issues: [goed] }), verdict({ issues: [goed] }));

    const first = await service.respond(session.id, "I goed to the meeting");
    const second = await service.respond(session.id, "I goed to the meeting");
    const reveal = await service.respond(session.id, "I goed to the meeting");

    expect([first, second].map((r) => [r.kind, r.mistakeType, r.rule])).toEqual([
      ["hint", goed.category, null],
      ["hint", goed.category, null],
    ]);
    expect(reveal).toMatchObject({ kind: "reveal", mistakeType: goed.category, rule: { name: pattern.name, rule: pattern.rule } });
    // After a reload, the screen gets the type and the rule back.
    expect((await service.resume(session.id)).hint).toMatchObject({ mistakeType: goed.category, rule: { name: pattern.name, rule: pattern.rule } });
  });

  it("gives the correct form without a rule for a hint saved before patterns", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }));
    await service.respond(session.id, "I goed to the meeting");
    const { pattern: _unused, ...old } = (await sessions.get(session.id))!.pending!;
    await sessions.setPending(session.id, { ...old, hintsGiven: 2 });
    tutor.verdicts.push(verdict({ issues: [goed] }));

    expect(await service.respond(session.id, "I goed to the meeting")).toMatchObject({ kind: "reveal", mistakeType: goed.category, rule: null });
  });

  it("saves the learner's line and the tutor's answer", async () => {
    const { session } = await service.start("free_talk", "en");
    tutor.verdicts.push(verdict({}));

    await service.respond(session.id, "We shipped the upload fix.");

    expect((await sessions.history(session.id)).slice(1)).toEqual([
      { role: "user", content: "We shipped the upload fix." },
      { role: "assistant", content: "Nice. What happened next?" },
    ]);
  });

  it("rejects an unknown session", async () => {
    await expect(service.respond("nope", "hi")).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("rejects a session that has ended", async () => {
    const { session } = await service.start("daily", "en");
    await service.end(session.id);
    await expect(service.respond(session.id, "hi")).rejects.toBeInstanceOf(SessionEndedError);
  });
});

describe("ConversationService.respond: the reply first, the analysis after", () => {
  const early = () => {
    const lines: TurnResult[] = [];
    return { lines, onReply: (line: TurnResult) => lines.push(line) };
  };

  it("hands over the reply before the verdict, then has nothing more to say", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [article], support: "PR = pull request.", coveredGoals: ["yesterday"] }));
    const { lines, onReply } = early();

    const result = await service.respond(session.id, "I opened PR", onReply);

    expect(lines).toEqual([
      {
        kind: "reply",
        message: "Nice. What happened next?",
        selfCorrected: false,
        support: null,
        mistake: null,
        mistakeType: null,
        rule: null,
        checkIn: false,
        coveredGoals: [],
        track: null,
        scaffold: null,
      },
    ]);
    expect(result).toEqual({
      kind: "reply",
      message: "",
      selfCorrected: false,
      support: "PR = pull request.",
      mistake: null,
      mistakeType: null,
      rule: null,
      checkIn: false,
      coveredGoals: ["yesterday"],
      track: null,
      scaffold: null,
    });
    expect((await sessions.history(session.id)).at(-1)?.content).toBe("Nice. What happened next?");
  });

  it("says the hint after the reply on a serious mistake, and keeps both in the conversation", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }));
    const { lines, onReply } = early();

    const result = await service.respond(session.id, "I goed to the meeting", onReply);

    expect(lines.map((l) => l.message)).toEqual(["Nice. What happened next?"]);
    expect(result).toMatchObject({ kind: "hint", message: "Check the past tense of 'go'." });
    expect((await sessions.history(session.id)).at(-1)?.content).toBe(
      "Nice. What happened next? Check the past tense of 'go'.",
    );
    expect((await sessions.get(session.id))?.pending).toMatchObject({ original: goed.original, hintsGiven: 1 });
  });

  it("asks whether to stop after the reply", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ reply: "Thanks.", coveredGoals: ["yesterday", "today", "blockers"] }));
    const { onReply } = early();

    const result = await service.respond(session.id, "Yesterday tests, today deploy, no blockers.", onReply);

    expect(result).toMatchObject({
      checkIn: true,
      message: "We've covered everything for this conversation. Do you want to stop here or keep going?",
    });
    expect((await sessions.history(session.id)).at(-1)?.content).toBe(
      "Thanks. We've covered everything for this conversation. Do you want to stop here or keep going?",
    );
  });

  it("waits for the whole verdict while a hint is pending: the reply may not be said", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }), verdict({ nextHint: "Think of 'went'." }));
    await service.respond(session.id, "I goed to the meeting");
    const { lines, onReply } = early();

    const result = await service.respond(session.id, "I goed there", onReply);

    expect(lines).toEqual([]);
    expect(result).toMatchObject({ kind: "hint", message: "Think of 'went'." });
  });

  it("answers in one piece when the tutor did not hand over the reply", async () => {
    const { session } = await service.start("daily", "en");
    tutor.speaksEarly = false;
    tutor.verdicts.push(verdict({ issues: [goed] }));
    const { lines, onReply } = early();

    const result = await service.respond(session.id, "I goed to the meeting", onReply);

    expect(lines).toEqual([]);
    expect(result.message).toBe("Check the past tense of 'go'.");
    expect((await sessions.history(session.id)).at(-1)?.content).toBe("Check the past tense of 'go'.");
  });
});

describe("ConversationService.respond: words in the learner's first language", () => {
  const prazo = { said: "prazo", words: "deadline" };

  it("saves them as new words, not as mistakes, and passes the written help along", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ newWords: [prazo], support: "“Prazo” em inglês é “deadline”." }));

    const result = await service.respond(session.id, "The prazo is Friday");

    expect(result).toMatchObject({
      kind: "reply",
      message: "Nice. What happened next?",
      selfCorrected: false,
      support: "“Prazo” em inglês é “deadline”.",
    });
    expect(mistakes.bank).toMatchObject([{ original: "prazo", correction: "deadline", category: NEW_WORD_CATEGORY }]);
    expect(mistakes.events).toMatchObject([{ original: "prazo", severity: "minor" }]);
  });

  it("sends new words to the tutor apart from the known mistakes", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ newWords: [prazo], issues: [article] }), verdict({}));
    await service.respond(session.id, "I opened PR before the prazo");
    await service.respond(session.id, "Next one");

    expect(tutor.requests[1].knownMistakes.map((m) => m.original)).toEqual(["I opened PR"]);
    expect(tutor.requests[1].knownNewWords).toEqual([{ original: "prazo", correction: "deadline", category: NEW_WORD_CATEGORY }]);
  });

  it("does not save a new word that is also listed as a mistake, or twice", async () => {
    const { session } = await service.start("daily", "en");
    const both = { ...article, original: "prazo", correction: "deadline" };
    tutor.verdicts.push(verdict({ issues: [both], newWords: [prazo, { said: "reunião", words: "meeting" }, { said: "reunião", words: "meeting" }] }));
    await service.respond(session.id, "prazo da reunião");
    expect(mistakes.events.map((e) => e.original)).toEqual(["prazo", "reunião"]);
  });

  it("drops written support that gives away the pending correction", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed], support: "Diga: I went to the meeting" }));
    const result = await service.respond(session.id, "I goed to the meeting");
    expect(result.kind).toBe("hint");
    expect(result.support).toBeNull();
  });

  it("counts a new word said in English later as a correct use", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ newWords: [prazo] }), verdict({ correctUses: ["prazo"] }));
    await service.respond(session.id, "The prazo is Friday");
    await service.respond(session.id, "The deadline is Friday");
    expect(mistakes.correctUses).toMatchObject([{ original: "prazo" }]);
  });

  it("does not count new words as mistakes in the fluency signals", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ newWords: [prazo], issues: [article] }));
    await service.respond(session.id, "I opened PR before the prazo"); // 6 words

    const summary = await service.end(session.id);

    expect(summary.mistakes.map((m) => m.category)).toEqual(["grammar", NEW_WORD_CATEGORY]);
    expect(summary.signals.mistakesPer100Words).toBeCloseTo((1 / 6) * 100);
  });
});

describe("ConversationService: help by the learner's level", () => {
  const placed = (level: SpeakingLevel["level"]): SpeakingLevel => ({
    language: "en",
    level,
    source: "placement",
    evidence: [],
    assessedAt: new Date(),
  });
  const stuckAtB1 = verdict({ reply: "No problem. You could start with: Yesterday I...", stuck: true, scaffold: "Yesterday I..." });

  it("starts each session at the step of the learner's level, and as before without a level", async () => {
    expect((await service.start("daily", "en")).session.step).toBe("conversation");
    levels.rows.push(placed("B1"));
    const { session } = await service.start("daily", "en");
    expect(session.step).toBe("supported");
    expect(tutor.opened.at(-1)?.step).toBe("supported");
    expect((await service.start("placement", "en")).session.step).toBeNull();
  });

  it("at B1, keeps the sentence start the tutor gave and counts the learner's next turn as helped", async () => {
    levels.rows.push(placed("B1"));
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(stuckAtB1, verdict({}));

    await service.respond(session.id, "I don't know how to say it.");
    await service.respond(session.id, "Yesterday I worked on the export.");

    expect(tutor.requests[1].scaffold).toBe("Yesterday I...");
    expect((await sessions.get(session.id))?.scaffold).toBeNull();
    expect(sessions.assisted.get(session.id)).toEqual([false, true]);
    expect((await service.end(session.id)).signals.unaidedShare).toBe(0.5);
  });

  it("at B1, sends the sentence start to the screen, outside any track", async () => {
    levels.rows.push(placed("B1"));
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(stuckAtB1);
    expect(await service.respond(session.id, "I don't know how to say it.")).toMatchObject({
      track: null,
      scaffold: "Yesterday I...",
    });
  });

  it("gives no words to say from B2 up, even if the tutor writes some", async () => {
    levels.rows.push(placed("B2"));
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(stuckAtB1);
    await service.respond(session.id, "I don't know.");
    expect((await sessions.get(session.id))?.scaffold).toBeNull();
  });

  it("drops the words to say when the turn is a hint: the learner retries their own sentence", async () => {
    levels.rows.push(placed("B1"));
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ ...stuckAtB1, issues: [goed] }));
    expect((await service.respond(session.id, "I goed to the meeting.")).kind).toBe("hint");
    expect((await sessions.get(session.id))?.scaffold).toBeNull();
  });

  it("counts a turn in the first language as helped", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ newWords: [{ said: "prazo", words: "deadline" }] }));
    await service.respond(session.id, "The prazo is Friday.");
    expect(sessions.assisted.get(session.id)).toEqual([true]);
  });
});

describe("ConversationService: the guided track (A1–A2)", () => {
  const placed = (level: SpeakingLevel["level"]): SpeakingLevel => ({
    language: "en",
    level,
    source: "placement",
    evidence: [],
    assessedAt: new Date(),
  });
  const model = "Yesterday I worked on the login screen.";

  async function startA1() {
    levels.rows.push(placed("A1"));
    tutor.openingScaffold = model;
    return (await service.start("daily", "en")).session;
  }

  it("opens at A1 with a model sentence for the first goal and keeps it to compare the repetition", async () => {
    const session = await startA1();
    expect(tutor.openPlans[0]?.otherwise).toEqual({
      stage: "model",
      retry: false,
      goal: { id: "yesterday", description: "said what they did yesterday" },
    });
    expect((await sessions.get(session.id))?.scaffold).toBe(model);
  });

  it("tells the screen the step and the words to say, on start, on each turn and on resume", async () => {
    const session = await startA1();
    expect(await service.resume(session.id)).toMatchObject({ track: { stage: "model", number: 1, total: 5 }, scaffold: model });

    tutor.verdicts.push(verdict({ scaffold: "Yesterday I worked on the audio upload." }));
    const turn = await service.respond(session.id, model);
    expect(turn).toMatchObject({
      track: { stage: "swap", number: 2, total: 5 },
      scaffold: "Yesterday I worked on the audio upload.",
    });
  });

  it("moves on once the learner repeats the model, and asks the tutor for the next step", async () => {
    const session = await startA1();
    tutor.verdicts.push(verdict({ scaffold: model }));
    await service.respond(session.id, "Yesterday I worked on the login screen.");

    const plan = tutor.requests[0].plan;
    expect(plan?.otherwise.stage).toBe("swap");
    expect((await sessions.get(session.id))?.track).toMatchObject({ stage: "swap", goal: "yesterday" });
    expect(sessions.assisted.get(session.id)).toEqual([true]);
  });

  it("says the model again, slower, when the repetition does not match", async () => {
    const session = await startA1();
    tutor.verdicts.push(verdict({ scaffold: model }));
    await service.respond(session.id, "Yesterday I...");
    expect(tutor.requests[0].plan?.otherwise).toMatchObject({ stage: "model", retry: true });
  });

  it("covers a goal only with the learner's own answer, never while repeating", async () => {
    const session = await startA1();
    tutor.verdicts.push(verdict({ scaffold: model, coveredGoals: ["yesterday"] }));
    expect((await service.respond(session.id, model)).coveredGoals).toEqual([]);
  });

  it("does not stop for a hint while the learner says the words given", async () => {
    const session = await startA1();
    tutor.verdicts.push(verdict({ scaffold: model, issues: [goed] }));
    expect((await service.respond(session.id, "I goed to the meeting.")).kind).toBe("reply");
  });

  it("at A2, asks the question first and gives the model only when the learner is stuck", async () => {
    levels.rows.push(placed("A2"));
    const { session } = await service.start("daily", "en");
    expect(tutor.openPlans[0]?.otherwise.stage).toBe("answer");
    tutor.verdicts.push(verdict({ stuck: true, scaffold: model }));

    await service.respond(session.id, "I don't know.");

    expect(tutor.requests[0].plan?.ifStuck.stage).toBe("model");
    expect(tutor.requests[0].plan?.otherwise.stage).toBe("again");
    expect(await sessions.get(session.id)).toMatchObject({ scaffold: model, track: { stage: "model" } });
  });

  it("stops for a hint at the learner's own answer, and moves on once it is fixed", async () => {
    levels.rows.push(placed("A2"));
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }), verdict({ pendingResolved: true }));

    expect((await service.respond(session.id, "I goed to the meeting.")).kind).toBe("hint");
    expect((await sessions.get(session.id))?.track?.stage).toBe("answer");
    expect(tutor.requests[0].plan?.hintsPause).toBe(true);

    const fixed = await service.respond(session.id, "I went to the meeting.");
    expect(fixed.selfCorrected).toBe(true);
    expect(fixed.coveredGoals).toEqual(["yesterday"]);
    expect((await sessions.get(session.id))?.track?.stage).toBe("again");
  });

  it("records a serious mistake made while repeating with its real severity, without a hint", async () => {
    const session = await startA1();
    tutor.verdicts.push(verdict({ scaffold: model, issues: [goed] }));
    await service.respond(session.id, "I goed to the meeting.");
    expect(mistakes.events.at(-1)).toMatchObject({ original: goed.original, severity: "serious" });
  });

  it("covers the goal when the learner answers alone, and asks to say it again", async () => {
    levels.rows.push(placed("A2"));
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ scaffold: "ignored" }));
    const turn = await service.respond(session.id, "Yesterday I fixed the upload bug.");
    expect(turn.coveredGoals).toEqual(["yesterday"]);
    expect(await sessions.get(session.id)).toMatchObject({ scaffold: null, track: { stage: "again" } });
  });
});

describe("ConversationService.end", () => {
  it("asks for the ended session to be remembered, placement included", async () => {
    const { session } = await service.start("free_talk", "en");
    await service.end(session.id);
    expect(memory.rememberLater).toHaveBeenCalledWith(session.id);

    const { session: placement } = await service.start("placement", "en");
    await service.end(placement.id);
    expect(memory.rememberLater).toHaveBeenCalledWith(placement.id);
  });

  it("does not wait for the memory to be saved", async () => {
    memory.rememberLater.mockReturnValue(new Promise(() => {}));
    const { session } = await service.start("free_talk", "en");
    await expect(service.end(session.id)).resolves.toEqual(expect.objectContaining({ sessionId: session.id }));
  });

  it("ends the session and summarizes its mistakes and self-corrections", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }), verdict({ pendingResolved: true, issues: [article] }));
    await service.respond(session.id, "I goed to the meeting");
    await service.respond(session.id, "I went to the meeting and I opened PR");

    const summary = await service.end(session.id);

    expect((await sessions.get(session.id))?.endedAt).toBeInstanceOf(Date);
    expect(summary.mode).toBe("daily");
    expect(summary.selfCorrections).toBe(1);
    expect(summary.mistakes.map((m) => [m.original, m.severity, m.selfCorrected])).toEqual([
      [goed.original, "serious", true],
      [article.original, "minor", false],
    ]);
  });

  it("computes the fluency signals from the turns, the mistakes and the timing", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }), verdict({ pendingResolved: true, issues: [article] }));
    await service.respond(session.id, "I goed to the meeting"); // 5 words
    await service.respond(session.id, "I went to the meeting and I opened PR"); // 9 words

    const timing = {
      learnerSpeechMs: 30_000,
      tutorSpeechMs: 20_000,
      pausesMs: [1000, 2000],
      longPausesMs: [1200],
      spokenWords: 14,
    };
    const summary = await service.end(session.id, timing);

    expect(summary.signals).toEqual({
      selfCorrectionRate: 1,
      mistakesPer100Words: (2 / 14) * 100,
      averagePauseMs: 1500,
      wordsPerMinute: 28,
      longPausesPerMinute: 2,
      unaidedShare: 1,
    });
  });

  it("can be called twice, keeping the first timing", async () => {
    const { session } = await service.start("daily", "en");
    await service.end(session.id, { learnerSpeechMs: 60_000, tutorSpeechMs: 1000, pausesMs: [], spokenWords: 90 });
    const again = await service.end(session.id, { learnerSpeechMs: 9000, tutorSpeechMs: 1000, pausesMs: [], spokenWords: 1 });
    expect(again).toMatchObject({ sessionId: session.id, signals: { wordsPerMinute: 90 } });
  });

  it("has no timing signals when the app sent no timing", async () => {
    const { session } = await service.start("daily", "en");
    const summary = await service.end(session.id);
    expect(summary.signals).toMatchObject({ averagePauseMs: null, wordsPerMinute: null, longPausesPerMinute: null });
  });

  it("rejects an unknown session", async () => {
    await expect(service.end("nope")).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

describe("ConversationService.resume", () => {
  it("returns what the screen needs to pick an open session up again", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed], nextHint: "Check the past tense of 'go'.", coveredGoals: ["yesterday"] }));
    await service.respond(session.id, "I goed to the meeting");

    const resumed = await service.resume(session.id);

    expect(resumed).toEqual({
      sessionId: session.id,
      mode: "daily",
      language: "en",
      startedAt: session.startedAt,
      turns: [
        { role: "assistant", content: "Tell me about your project." },
        { role: "user", content: "I goed to the meeting" },
        { role: "assistant", content: expect.any(String) },
      ],
      goals: ["yesterday", "today", "blockers"],
      coveredGoals: ["yesterday"],
      // Before the correct form, the type but never the rule.
      hint: { hintsGiven: 1, revealed: false, mistake: goed.original, mistakeType: goed.category, rule: null },
      track: null,
      scaffold: null,
    });
    // The hints must not give the correction away.
    expect(JSON.stringify(resumed)).not.toContain(goed.correction);
  });

  it("has no hint when no correction is pending", async () => {
    const { session } = await service.start("free_talk", "en");
    expect(await service.resume(session.id)).toMatchObject({ goals: [], coveredGoals: [], hint: null });
  });

  it("rejects an unknown session and one that has ended", async () => {
    await expect(service.resume("nope")).rejects.toBeInstanceOf(SessionNotFoundError);
    const { session } = await service.start("daily", "en");
    await service.end(session.id);
    await expect(service.resume(session.id)).rejects.toBeInstanceOf(SessionEndedError);
  });
});

describe("takeaways in the summary", () => {
  it("lists the session's patterns to take away", async () => {
    const pattern = { key: "articles", name: "A before a singular noun", rule: "Use a antes de substantivo singular." };
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [{ ...article, pattern }] }));
    await service.respond(session.id, "I opened PR");

    expect((await service.end(session.id)).takeaways).toEqual([
      { patternId: "p-articles", category: "grammar", name: pattern.name, rule: pattern.rule, said: article.original },
    ]);
  });

  it("has nothing to take away after the placement interview", async () => {
    const pattern = { key: "articles", name: "A before a singular noun", rule: "Use a antes de substantivo singular." };
    const { session } = await service.start("placement", "en");
    tutor.verdicts.push(verdict({ issues: [{ ...article, pattern }] }));
    await service.respond(session.id, "I opened PR");

    expect((await service.end(session.id)).takeaways).toEqual([]);
  });
});

describe("a pattern comes back in the session", () => {
  it("asks the tutor to bring a pattern back once, 3 learner turns after it was broken", async () => {
    const pattern = { key: "articles", name: "A before a singular noun", rule: "Use a antes de substantivo singular." };
    const { session } = await service.start("free_talk", "en");
    tutor.verdicts.push(verdict({ issues: [{ ...article, severity: "minor", pattern }] }));
    await service.respond(session.id, "I opened PR");
    for (const line of ["Then I tested it", "It went well", "We shipped it"]) {
      tutor.verdicts.push(verdict({}));
      await service.respond(session.id, line);
    }

    expect(tutor.requests.map((r) => r.bringBack)).toEqual([[], [], [{ key: "articles", name: pattern.name }], []]);
  });

  it("never brings a pattern back in the placement interview", async () => {
    const pattern = { key: "articles", name: "A before a singular noun", rule: "Use a antes de substantivo singular." };
    const { session } = await service.start("placement", "en");
    tutor.verdicts.push(verdict({ issues: [{ ...article, severity: "minor", pattern }] }));
    await service.respond(session.id, "I opened PR");
    for (const line of ["Then I tested it", "It went well"]) {
      tutor.verdicts.push(verdict({}));
      await service.respond(session.id, line);
    }
    expect(tutor.requests.every((r) => r.bringBack.length === 0)).toBe(true);
  });
});

describe("review schedule", () => {
  const pattern = { key: "articles", name: "A before a singular noun", rule: "Use a antes de substantivo singular." };
  const tomorrow = () => new Date(clock.now().getTime() + 86_400_000);

  it("brings a pattern back tomorrow when the mistake is made, and a new word too", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [{ ...article, pattern }], newWords: [{ said: "prazo", words: "deadline" }] }));

    await service.respond(session.id, "I opened PR before the prazo");

    expect(reviews.items.get("pattern:p-articles")).toEqual({ language: "en", step: 0, dueAt: tomorrow() });
    expect(reviews.items.get("new_word:m2")).toEqual({ language: "en", step: 0, dueAt: tomorrow() });
  });

  it("moves a due pattern forward when the learner says it right in a later session", async () => {
    const { session: old } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [{ ...article, pattern }] }));
    await service.respond(old.id, "I opened PR");
    clock.advanceMinutes(2 * 24 * 60);

    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ correctUses: [article.original] }));
    await service.respond(session.id, "I opened a PR");

    expect(reviews.items.get("pattern:p-articles")).toMatchObject({ step: 1 });
  });

  it("moves a pattern back once when one turn breaks it twice", async () => {
    const { session } = await service.start("daily", "en");
    reviews.items.set("pattern:p-articles", { language: "en", step: 3, dueAt: tomorrow() });
    tutor.verdicts.push(
      verdict({ issues: [{ ...article, pattern }, { ...article, original: "I closed issue", correction: "I closed an issue", pattern }] }),
    );

    await service.respond(session.id, "I opened PR and I closed issue");

    expect(reviews.items.get("pattern:p-articles")).toMatchObject({ step: 2 });
  });
});

describe("correct uses of known mistakes", () => {
  it("records each known mistake the learner got right, by its bank text", async () => {
    const { session: old } = await service.start("daily", "en");
    await mistakes.record({ language: "en", original: goed.original, correction: goed.correction, category: "grammar", pattern: null }, { sessionId: old.id, severity: "serious" });
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ correctUses: ["i goed to the meeting.", "something never in the bank"] }));

    await service.respond(session.id, "I went to the meeting");

    expect(mistakes.correctUses).toEqual([{ sessionId: session.id, language: "en", original: goed.original }]);
  });

  it("keeps a correct use of another known mistake while a correction is pending", async () => {
    const { session: old } = await service.start("daily", "en");
    await mistakes.record({ language: "en", original: article.original, correction: article.correction, category: "grammar", pattern: null }, { sessionId: old.id, severity: "minor" });
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }), verdict({ pendingResolved: true, correctUses: [goed.original, article.original] }));

    await service.respond(session.id, "I goed to the meeting");
    await service.respond(session.id, "I went to the meeting and I opened a PR");

    expect(mistakes.correctUses).toEqual([{ sessionId: session.id, language: "en", original: article.original }]);
  });

  it("does not count a retry of a pending correction as a correct use", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }), verdict({ pendingResolved: true, correctUses: [goed.original] }));

    await service.respond(session.id, "I goed to the meeting");
    await service.respond(session.id, "I went to the meeting");

    expect(mistakes.correctUses).toEqual([]);
  });
});

describe("ConversationService, placement interview", () => {
  it("starts with the placement tasks and no practice targets", async () => {
    bankEntries = [entry({ occurrences: 5 })];
    const { session, goals } = await service.start("placement", "en");
    expect(goals).toEqual(["warm_up", "routine", "past_work", "project", "opinion"]);
    expect(session.targets).toEqual([]);
  });

  it("never stops for a hint: a serious mistake is recorded as minor", async () => {
    const { session } = await service.start("placement", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }));
    const result = await service.respond(session.id, "I goed to the meeting");
    expect(result.kind).toBe("reply");
    expect(mistakes.events).toEqual([expect.objectContaining({ original: goed.original, severity: "minor" })]);
    expect((await sessions.get(session.id))?.pending).toBeNull();
  });

  it("estimates and stores the level when it ends, once", async () => {
    const { session } = await service.start("placement", "en");
    tutor.verdicts.push(verdict({}));
    await service.respond(session.id, "Yesterday I fix the upload");

    const summary = await service.end(session.id);
    const placed = { language: "en", level: "A2", source: "placement", evidence: ["Yesterday I fix the upload"], assessedAt: clock.now() };
    expect(summary.level).toEqual(placed);
    expect(assessor.calls).toEqual([{ language: "en", turns: await sessions.history(session.id) }]);
    expect(levels.rows).toEqual([placed]);

    // Ending again shows the same level without assessing again.
    expect((await service.end(session.id)).level).toEqual(placed);
    expect(assessor.calls).toHaveLength(1);
  });

  it("gives no level when the learner said nothing", async () => {
    const { session } = await service.start("placement", "en");
    expect((await service.end(session.id)).level).toBeNull();
    expect(assessor.calls).toEqual([]);
  });

  it("keeps the session open when the assessment fails, so ending again retries it", async () => {
    const { session } = await service.start("placement", "en");
    tutor.verdicts.push(verdict({}));
    await service.respond(session.id, "Yesterday I fix the upload");
    assessor.failure = new TutorUnavailableError("down");

    await expect(service.end(session.id)).rejects.toBeInstanceOf(TutorUnavailableError);
    expect((await sessions.get(session.id))?.endedAt).toBeNull();

    assessor.failure = null;
    expect((await service.end(session.id)).level?.level).toBe("A2");
  });

  it("stores one level per session, so a second end at the same time keeps the first", async () => {
    const { session } = await service.start("placement", "en");
    tutor.verdicts.push(verdict({}));
    await service.respond(session.id, "Yesterday I fix the upload");
    const [first, second] = await Promise.all([service.end(session.id), service.end(session.id)]);
    expect(first.level).toEqual(second.level);
    expect(levels.rows).toHaveLength(1);
  });

  it("shows the session's own level later, even after a level set by hand", async () => {
    const { session } = await service.start("placement", "en");
    tutor.verdicts.push(verdict({}));
    await service.respond(session.id, "Yesterday I fix the upload");
    const placed = (await service.end(session.id)).level;
    await levels.add({ language: "en", level: "B1", source: "manual", evidence: [], assessedAt: clock.now() });
    expect((await service.end(session.id)).level).toEqual(placed);
  });

  it("asks to stop with its own line when the interview is over", async () => {
    const { session } = await service.start("placement", "en");
    tutor.verdicts.push(verdict({ reply: "Thanks, that was great.", coveredGoals: ["warm_up", "routine", "past_work", "project", "opinion"] }));
    const result = await service.respond(session.id, "I think it depends");
    expect(result.checkIn).toBe(true);
    expect(result.message).toContain("see your level");
  });

  it("has no level in the meeting modes", async () => {
    const { session } = await service.start("daily", "en");
    expect((await service.end(session.id)).level).toBeNull();
    expect(assessor.calls).toEqual([]);
  });
});

describe("ConversationService.respond: saving the turn", () => {
  it("keeps a reply already handed over when reading the rest of the turn fails, so it can be said again", async () => {
    const { session } = await service.start("daily", "en");
    tutor.evaluate = async (_request, onReply) => {
      onReply?.("Nice. What happened next?");
      throw new TutorUnavailableError("The stream stopped.");
    };

    await expect(service.respond(session.id, "I opened PR", () => {})).rejects.toBeInstanceOf(TutorUnavailableError);

    expect((await sessions.history(session.id)).slice(-2)).toEqual([
      { role: "user", content: "I opened PR" },
      { role: "assistant", content: "Nice. What happened next?" },
    ]);
    expect(mistakes.events).toEqual([]);
  });

  it("saves nothing when the tutor fails before any reply", async () => {
    const { session } = await service.start("daily", "en");
    tutor.evaluate = async () => {
      throw new TutorUnavailableError("Down.");
    };

    await expect(service.respond(session.id, "I opened PR", () => {})).rejects.toBeInstanceOf(TutorUnavailableError);

    expect(await sessions.history(session.id)).toHaveLength(1);
  });

  it("refuses a turn when another one of the session was saved while it was answered, and records nothing", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }));
    const evaluate = tutor.evaluate.bind(tutor);
    tutor.evaluate = async (request, onReply) => {
      await sessions.appendTurn(session.id, { role: "user", content: "Sent from another tab." });
      return evaluate(request, onReply);
    };

    await expect(service.respond(session.id, "I goed to the meeting")).rejects.toBeInstanceOf(TurnConflictError);

    expect(mistakes.events).toEqual([]);
    expect((await sessions.get(session.id))?.pending).toBeNull();
  });

  it("refuses a turn of a session that ended while it was answered", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }));
    const evaluate = tutor.evaluate.bind(tutor);
    tutor.evaluate = async (request, onReply) => {
      await sessions.end(session.id, null);
      return evaluate(request, onReply);
    };

    await expect(service.respond(session.id, "I goed to the meeting")).rejects.toBeInstanceOf(SessionEndedError);
    expect(mistakes.events).toEqual([]);
  });

  it("keeps a reply already handed over when saving the analysed turn fails", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [goed] }));
    const setPending = vi.spyOn(sessions, "setPending").mockRejectedValueOnce(new Error("Connection lost."));

    await expect(service.respond(session.id, "I goed to the meeting", () => {})).rejects.toThrow("Connection lost.");

    setPending.mockRestore();
    expect((await sessions.history(session.id)).slice(-2)).toEqual([
      { role: "user", content: "I goed to the meeting" },
      { role: "assistant", content: "Nice. What happened next?" },
    ]);
  });
});
