import { beforeEach, describe, expect, it } from "vitest";
import type { TutorVerdict } from "../domain/conversation/correction-policy.js";
import type { Mode } from "../domain/conversation/mode.js";
import type { ChatTurn, Issue, PendingCorrection, Session, Severity } from "../domain/conversation/types.js";
import type { LearnerContextPort } from "../domain/ports/learner-context.port.js";
import type { Mistake, MistakeRepository, NewMistake, SessionMistake } from "../domain/ports/mistake.repository.js";
import type { SessionRepository } from "../domain/ports/session.repository.js";
import type { TutorContext, TutorPort, TutorRequest } from "../domain/ports/tutor.port.js";
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

class FakeSessions implements SessionRepository {
  rows = new Map<string, Session & { turns: ChatTurn[] }>();
  async create(input: { language: string; mode: Mode }) {
    const id = `s${this.rows.size + 1}`;
    this.rows.set(id, { id, ...input, pending: null, endedAt: null, turns: [] });
    return { id, ...input, pending: null, endedAt: null };
  }
  async get(id: string) {
    const row = this.rows.get(id);
    if (!row) return null;
    const { turns: _, ...session } = row;
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
  async end(id: string) {
    this.rows.get(id)!.endedAt = new Date();
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

    expect(result).toEqual({ kind: "reply", message: "Nice. What happened next?", selfCorrected: false });
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

    expect(result).toEqual({ kind: "reply", message: "Nice. What happened next?", selfCorrected: true });
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

    expect(result).toEqual({ kind: "hint", message: "Think of 'go, ___, gone'.", selfCorrected: false });
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

  it("can be called twice", async () => {
    const { session } = await service.start("daily", "en");
    await service.end(session.id);
    await expect(service.end(session.id)).resolves.toMatchObject({ sessionId: session.id });
  });

  it("rejects an unknown session", async () => {
    await expect(service.end("nope")).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});
