import { beforeEach, describe, expect, it } from "vitest";
import type { TutorVerdict } from "../domain/conversation/correction-policy.js";
import type { Mode } from "../domain/conversation/mode.js";
import type { ChatTurn, Issue, PendingCorrection, Session, Severity } from "../domain/conversation/types.js";
import type { LearnerContextPort } from "../domain/ports/learner-context.port.js";
import type { Mistake, MistakeRepository, NewMistake, SessionMistake } from "../domain/ports/mistake.repository.js";
import type { SessionTiming } from "../domain/conversation/fluency.js";
import type { ConfidenceMoment, SessionRepository } from "../domain/ports/session.repository.js";
import type { TutorContext, TutorPort, TutorRequest } from "../domain/ports/tutor.port.js";
import { NEW_WORD_CATEGORY } from "../domain/conversation/types.js";
import { ConversationService, SessionEndedError, SessionNotFoundError } from "./conversation.service.js";

class FakeTutor implements TutorPort {
  verdicts: TutorVerdict[] = [];
  opened: TutorContext[] = [];
  requests: TutorRequest[] = [];
  async open(context: TutorContext) {
    this.opened.push(context);
    return "Tell me about your project.";
  }
  async evaluate(request: TutorRequest) {
    this.requests.push(request);
    const next = this.verdicts.shift();
    if (!next) throw new Error("No verdict queued");
    return next;
  }
}

type Row = Session & { turns: ChatTurn[]; timing: SessionTiming | null; before: number | null; after: number | null };

class FakeSessions implements SessionRepository {
  rows = new Map<string, Row>();
  async create(input: { language: string; mode: Mode }) {
    const id = `s${this.rows.size + 1}`;
    this.rows.set(id, { id, ...input, pending: null, endedAt: null, turns: [], timing: null, before: null, after: null });
    return { id, ...input, pending: null, endedAt: null };
  }
  async get(id: string) {
    const row = this.rows.get(id);
    if (!row) return null;
    const { turns: _t, timing: _ti, before: _b, after: _a, ...session } = row;
    return session;
  }
  async appendTurn(id: string, turn: ChatTurn) {
    this.rows.get(id)!.turns.push(turn);
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
  async setConfidence(id: string, moment: ConfidenceMoment, value: number) {
    this.rows.get(id)![moment] = value;
  }
  async outcome(id: string) {
    const row = this.rows.get(id);
    return row ? { timing: row.timing, confidence: { before: row.before, after: row.after } } : null;
  }
}

class FakeMistakes implements MistakeRepository {
  bank: Mistake[] = [];
  events: { sessionId: string; original: string; severity: Severity; selfCorrected: boolean }[] = [];
  async record(m: NewMistake, o: { sessionId: string; severity: Severity }) {
    let saved = this.bank.find((b) => b.language === m.language && b.original === m.original);
    if (saved) saved.occurrences += 1;
    else {
      saved = { id: `m${this.bank.length + 1}`, ...m, occurrences: 1, lastSeenAt: new Date() };
      this.bank.push(saved);
    }
    this.events.push({ sessionId: o.sessionId, original: m.original, severity: o.severity, selfCorrected: false });
    return saved;
  }
  correctUses: { sessionId: string; language: string; original: string }[] = [];
  async recordCorrectUse(sessionId: string, mistake: { language: string; original: string }) {
    this.correctUses.push({ sessionId, ...mistake });
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
        };
      });
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
};
const article: Issue = {
  original: "I opened PR",
  correction: "I opened a PR",
  category: "grammar",
  severity: "minor",
  hint: "Something small is missing before 'PR'.",
  matchesKnownMistake: false,
};
const verdict = (v: Partial<TutorVerdict>): TutorVerdict => ({
  reply: "Nice. What happened next?",
  issues: [],
  pendingResolved: false,
  nextHint: null,
  correctUses: [],
  newWords: [],
  support: null,
  ...v,
});

let tutor: FakeTutor;
let sessions: FakeSessions;
let mistakes: FakeMistakes;
let service: ConversationService;

beforeEach(() => {
  tutor = new FakeTutor();
  sessions = new FakeSessions();
  mistakes = new FakeMistakes();
  service = new ConversationService(tutor, sessions, mistakes, learnerContext);
});

describe("ConversationService.start", () => {
  it("opens the scene for the mode with the learner's context and saves the first line", async () => {
    const { session, message } = await service.start("presentation", "en");

    expect(tutor.opened).toEqual([{ mode: "presentation", language: "en", learnerContext: "Works on Oral Collector." }]);
    expect(message).toBe("Tell me about your project.");
    expect(await sessions.history(session.id)).toEqual([{ role: "assistant", content: message }]);
  });
});

describe("ConversationService.respond", () => {
  it("keeps talking and only records a minor mistake", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [article] }));

    const result = await service.respond(session.id, "I opened PR");

    expect(result).toEqual({ kind: "reply", message: "Nice. What happened next?", selfCorrected: false, support: null });
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

  it("pauses on a minor mistake that is already in the bank, and records it as serious", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ issues: [{ ...article, matchesKnownMistake: true }] }));

    const result = await service.respond(session.id, "I opened PR");

    expect(result.kind).toBe("hint");
    expect(mistakes.events[0].severity).toBe("serious");
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

    expect(result).toEqual({ kind: "reply", message: "Nice. What happened next?", selfCorrected: true, support: null });
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

    expect(result).toEqual({ kind: "hint", message: "Think of 'go, ___, gone'.", selfCorrected: false, support: null });
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
      verdict({ issues: [goed, { ...article, matchesKnownMistake: true }] }),
    );
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

describe("ConversationService.respond: words in the learner's first language", () => {
  const prazo = { said: "prazo", words: "deadline" };

  it("saves them as new words, not as mistakes, and passes the written help along", async () => {
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ newWords: [prazo], support: "“Prazo” em inglês é “deadline”." }));

    const result = await service.respond(session.id, "The prazo is Friday");

    expect(result).toEqual({
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

describe("ConversationService.end", () => {
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

    const timing = { learnerSpeechMs: 30_000, tutorSpeechMs: 20_000, pausesMs: [1000, 2000] };
    const summary = await service.end(session.id, timing);

    expect(summary.signals).toEqual({
      selfCorrectionRate: 1,
      mistakesPer100Words: (2 / 14) * 100,
      averagePauseMs: 1500,
      speakingShare: 0.6,
    });
  });

  it("can be called twice, keeping the first timing", async () => {
    const { session } = await service.start("daily", "en");
    await service.end(session.id, { learnerSpeechMs: 1000, tutorSpeechMs: 1000, pausesMs: [] });
    const again = await service.end(session.id, { learnerSpeechMs: 9000, tutorSpeechMs: 1000, pausesMs: [] });
    expect(again).toMatchObject({ sessionId: session.id, signals: { speakingShare: 0.5 } });
  });

  it("has no timing signals when the app sent no timing", async () => {
    const { session } = await service.start("daily", "en");
    const summary = await service.end(session.id);
    expect(summary.signals).toMatchObject({ averagePauseMs: null, speakingShare: null });
  });

  it("includes the confidence ratings", async () => {
    const { session } = await service.start("daily", "en");
    await service.rateConfidence(session.id, "before", 2);
    const summary = await service.end(session.id);
    expect(summary.confidence).toEqual({ before: 2, after: null });
  });

  it("rejects an unknown session", async () => {
    await expect(service.end("nope")).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

describe("ConversationService.rateConfidence", () => {
  it("stores before and after, even once the session has ended", async () => {
    const { session } = await service.start("presentation", "en");
    await service.rateConfidence(session.id, "before", 2);
    await service.end(session.id);
    await service.rateConfidence(session.id, "after", 4);
    expect(await sessions.outcome(session.id)).toMatchObject({ confidence: { before: 2, after: 4 } });
  });

  it.each([0, 6, 2.5])("rejects %s", async (value) => {
    const { session } = await service.start("daily", "en");
    await expect(service.rateConfidence(session.id, "before", value)).rejects.toBeInstanceOf(RangeError);
  });

  it("rejects an unknown session", async () => {
    await expect(service.rateConfidence("nope", "after", 3)).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

describe("correct uses of known mistakes", () => {
  it("records each known mistake the learner got right, by its bank text", async () => {
    const { session: old } = await service.start("daily", "en");
    await mistakes.record({ language: "en", original: goed.original, correction: goed.correction, category: "grammar" }, { sessionId: old.id, severity: "serious" });
    const { session } = await service.start("daily", "en");
    tutor.verdicts.push(verdict({ correctUses: ["i goed to the meeting.", "something never in the bank"] }));

    await service.respond(session.id, "I went to the meeting");

    expect(mistakes.correctUses).toEqual([{ sessionId: session.id, language: "en", original: goed.original }]);
  });

  it("keeps a correct use of another known mistake while a correction is pending", async () => {
    const { session: old } = await service.start("daily", "en");
    await mistakes.record({ language: "en", original: article.original, correction: article.correction, category: "grammar" }, { sessionId: old.id, severity: "minor" });
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
