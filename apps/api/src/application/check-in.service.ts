import { Inject, Injectable } from "@nestjs/common";
import {
  CHECK_IN_LIMIT_MS,
  CHECK_IN_TASK,
  type CheckIn,
  type CheckInPace,
  checkInDueAt,
  checkInPace,
} from "../domain/check-in/check-in.js";
import { countWords } from "../domain/conversation/fluency.js";
import { DomainError, InvalidInputError } from "../domain/errors.js";
import { LONG_PAUSE_MS } from "../domain/faster/faster-rounds.js";
import { CHECK_IN_REPOSITORY, type CheckInRecording, type CheckInRepository } from "../domain/ports/check-in.repository.js";
import { CLOCK, type Clock } from "../domain/ports/clock.port.js";
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

export interface CheckInOverview {
  task: string;
  limitMs: number;
  dueAt: Date;
  due: boolean;
  /** Newest first. */
  checkIns: CheckInPace[];
}

/** A check-in and the one before it, to compare. */
export interface CheckInResult {
  checkIn: CheckInPace & { transcript: string };
  previous: CheckInPace | null;
}

/** The check-in every 2 weeks: one recording of the same task, its pace, and the earlier ones. */
@Injectable()
export class CheckInService {
  constructor(
    @Inject(CHECK_IN_REPOSITORY) private readonly checkIns: CheckInRepository,
    @Inject(STT_PORT) private readonly stt: SpeechToTextPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async overview(language: string): Promise<CheckInOverview> {
    const now = this.clock.now();
    const checkIns = await this.checkIns.list(language);
    const dueAt = checkInDueAt(checkIns[0]?.recordedAt ?? null, now);
    return { task: CHECK_IN_TASK, limitMs: CHECK_IN_LIMIT_MS, dueAt, due: dueAt <= now, checkIns: checkIns.map(checkInPace) };
  }

  /**
   * Transcribes and stores a check-in with its recording.
   * @param measure timing the web app measured: speech from the first word to the last, and the silences inside it.
   */
  async record(
    language: string,
    recording: CheckInRecording,
    measure: { speechMs: number; pausesMs: number[] },
  ): Promise<CheckInResult> {
    if (recording.audio.length === 0) throw new InvalidInputError("The recording is empty.");
    if (measure.speechMs > CHECK_IN_LIMIT_MS + LIMIT_GRACE_MS) {
      throw new InvalidInputError(`A check-in has ${CHECK_IN_LIMIT_MS / 1000} s; ${measure.speechMs} ms of speech is too long.`);
    }
    const now = this.clock.now();
    const [latest] = await this.checkIns.list(language, 1);
    const dueAt = checkInDueAt(latest?.recordedAt ?? null, now);
    if (dueAt > now) throw new CheckInNotDueError(dueAt);
    const { text } = await this.stt.transcribe(recording.audio, language, { mimeType: recording.mimeType });
    const transcript = text.trim();
    if (!transcript) throw new InvalidInputError("Nothing was heard in the recording.");
    const checkIn = await this.checkIns.create(
      {
        language,
        task: CHECK_IN_TASK,
        recordedAt: now,
        transcript,
        spokenWords: countWords(transcript),
        speechMs: measure.speechMs,
        longPauses: measure.pausesMs.filter((ms) => ms >= LONG_PAUSE_MS).length,
      },
      recording,
    );
    return this.resultOf(checkIn);
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
