import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  CHECK_IN_LIMIT_MS,
  CHECK_IN_TASK,
  CHECK_IN_TOPIC_LIMIT_MS,
  type CheckIn,
  type CheckInPace,
  type CheckInTopic,
  checkInDueAt,
  checkInKind,
  checkInPace,
  nextCheckInTopic,
  topicTaskDue,
} from "../domain/check-in/check-in.js";
import { countWords } from "../domain/conversation/fluency.js";
import { DomainError, InvalidInputError } from "../domain/errors.js";
import { LONG_PAUSE_MS } from "../domain/faster/faster-rounds.js";
import { CHECK_IN_READER_PORT, type CheckInReaderPort, type CheckInReading } from "../domain/ports/check-in-reader.port.js";
import { CHECK_IN_REPOSITORY, type CheckInRecording, type CheckInRepository } from "../domain/ports/check-in.repository.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
import { TutorUnavailableError } from "../domain/ports/tutor.port.js";
import { STT_PORT, type SpeechToTextPort } from "../domain/ports/voice.port.js";

/** Speech measured a little past the 2 minutes still counts: the last words are cut when the time runs out. */
const LIMIT_GRACE_MS = 5_000;

export class CheckInNotFoundError extends DomainError {
  readonly code = "not_found";

  constructor(id: string) {
    super(`Check-in ${id} not found.`, "Check-in not found.");
  }
}

export class CheckInNotDueError extends DomainError {
  readonly code = "invalid";

  constructor(dueAt: Date) {
    super(`The next check-in is due on ${dueAt.toISOString()}.`, "The next check-in isn't due yet.");
  }
}

export class CheckInTopicNotDueError extends DomainError {
  readonly code = "invalid";

  constructor(task: string) {
    super(`The topic task ${task} is not due.`, "This part of the check-in isn't due now.");
  }
}

export interface CheckInOverview {
  task: string;
  limitMs: number;
  dueAt: Date;
  due: boolean;
  /** The second task, right after the fixed one: a topic never given before. */
  topic: { task: CheckInTopic; limitMs: number; due: boolean };
  /** The fixed task's check-ins, newest first. */
  checkIns: CheckInPace[];
}

/** A check-in and the one before it, to compare. */
export interface CheckInResult {
  checkIn: CheckInPace & { transcript: string };
  previous: CheckInPace | null;
}

/** The check-in every 2 weeks: the same task and a new topic, each recording with its pace and the earlier one of its kind. */
@Injectable()
export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);
  private readonly storing = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(CHECK_IN_REPOSITORY) private readonly checkIns: CheckInRepository,
    @Inject(STT_PORT) private readonly stt: SpeechToTextPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CHECK_IN_READER_PORT) private readonly reader: CheckInReaderPort,
  ) {}

  async overview(language: string): Promise<CheckInOverview> {
    const now = this.clock.now();
    const all = await this.checkIns.list(language);
    const fixed = all.filter((c) => checkInKind(c.task) === "benchmark");
    const dueAt = checkInDueAt(fixed[0]?.recordedAt ?? null, now);
    return {
      task: CHECK_IN_TASK,
      limitMs: CHECK_IN_LIMIT_MS,
      dueAt,
      due: dueAt <= now,
      topic: this.topicOf(all, now),
      checkIns: fixed.map(checkInPace),
    };
  }

  private topicOf(all: CheckIn[], now: Date): CheckInOverview["topic"] {
    const given = all.filter((c) => checkInKind(c.task) === "topic").map((c) => c.task);
    return { task: nextCheckInTopic(given), limitMs: CHECK_IN_TOPIC_LIMIT_MS, due: topicTaskDue(all, now) };
  }

  /**
   * Transcribes and stores a check-in with its recording: the fixed task, or (`task`) the topic task due right after it.
   * @param measure timing the web app measured: speech from the first word to the last, and the silences inside it.
   */
  async record(
    language: string,
    recording: CheckInRecording,
    measure: { speechMs: number; pausesMs: number[] },
    task: string = CHECK_IN_TASK,
  ): Promise<CheckInResult> {
    if (recording.audio.length === 0) throw new InvalidInputError("The recording is empty.");
    const limitMs = task === CHECK_IN_TASK ? CHECK_IN_LIMIT_MS : CHECK_IN_TOPIC_LIMIT_MS;
    if (measure.speechMs > limitMs + LIMIT_GRACE_MS) {
      throw new InvalidInputError(`This task has ${limitMs / 1000} s; ${measure.speechMs} ms of speech is too long.`);
    }
    const now = this.clock.now();
    await this.assertDue(language, task, now);
    const { text } = await this.stt.transcribe(recording.audio, language, { mimeType: recording.mimeType });
    const transcript = text.trim();
    if (!transcript) throw new InvalidInputError("Nothing was heard in the recording.");
    const reading = await this.readTranscript(language, transcript);
    // Checked again and stored one at a time: a second upload of the same task (a retry, a double tap) may have
    // been stored during the slow steps above.
    const checkIn = await this.oneAtATime(language, async () => {
      await this.assertDue(language, task, now);
      return this.checkIns.create(
        {
          language,
          task,
          recordedAt: now,
          transcript,
          spokenWords: countWords(transcript),
          speechMs: measure.speechMs,
          longPauses: measure.pausesMs.filter((ms) => ms >= LONG_PAUSE_MS).length,
          mistakes: reading?.mistakes ?? null,
          otherLanguageWords: reading?.otherLanguageWords ?? null,
        },
        recording,
      );
    });
    return this.resultOf(checkIn);
  }

  private async assertDue(language: string, task: string, now: Date): Promise<void> {
    if (task === CHECK_IN_TASK) {
      const [latest] = await this.checkIns.list(language, { limit: 1, kind: "benchmark" });
      const dueAt = checkInDueAt(latest?.recordedAt ?? null, now);
      if (dueAt > now) throw new CheckInNotDueError(dueAt);
      return;
    }
    const topic = this.topicOf(await this.checkIns.list(language), now);
    if (task !== topic.task || !topic.due) throw new CheckInTopicNotDueError(task);
  }

  /** Runs `store` after any earlier one of the same language has finished (this API runs as one process). */
  private oneAtATime<T>(language: string, store: () => Promise<T>): Promise<T> {
    const run = (this.storing.get(language) ?? Promise.resolve()).then(store, store);
    this.storing.set(language, run.catch(() => {}));
    return run;
  }

  /** The tutor's reading of the transcript, or null when it is unavailable: the recording and pace are kept anyway. */
  private async readTranscript(language: string, transcript: string): Promise<CheckInReading | null> {
    try {
      return await this.reader.read({ language, transcript });
    } catch (error) {
      if (!(error instanceof TutorUnavailableError)) throw error;
      this.logger.warn(`Check-in stored without its mistakes: ${error.message}`);
      return null;
    }
  }

  async result(id: string): Promise<CheckInResult> {
    const checkIn = await this.checkIns.get(id);
    if (!checkIn) throw new CheckInNotFoundError(id);
    return this.resultOf(checkIn);
  }

  async recording(id: string): Promise<CheckInRecording> {
    const recording = await this.checkIns.recording(id);
    if (!recording) throw new CheckInNotFoundError(id);
    return recording;
  }

  private async resultOf(checkIn: CheckIn): Promise<CheckInResult> {
    const previous = await this.checkIns.previous(checkIn.id);
    return {
      checkIn: { ...checkInPace(checkIn), transcript: checkIn.transcript },
      previous: previous ? checkInPace(previous) : null,
    };
  }
}
