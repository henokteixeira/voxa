import type { CheckIn } from "../check-in/check-in.js";

/** A check-in's recording, as it was uploaded. */
export interface CheckInRecording {
  mimeType: string;
  audio: Buffer;
}

export interface CheckInRepository {
  /** Stores a check-in with its recording. */
  create(checkIn: Omit<CheckIn, "id">, recording: CheckInRecording): Promise<CheckIn>;
  get(id: string): Promise<CheckIn | null>;
  /** The check-ins of a language, newest first. */
  list(language: string): Promise<CheckIn[]>;
  recording(id: string): Promise<CheckInRecording | null>;
}

export const CHECK_IN_REPOSITORY = Symbol("CHECK_IN_REPOSITORY");
