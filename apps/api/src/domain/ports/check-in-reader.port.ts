/** What the tutor finds reading a check-in's transcript afterwards. */
export interface CheckInReading {
  mistakes: number;
  /** Words said in another language than the check-in's (the learner didn't know them yet). */
  otherLanguageWords: number;
}

/** Reads a check-in's transcript for mistakes, after the recording. Implementations live in infra/. */
export interface CheckInReaderPort {
  read(input: { language: string; transcript: string }): Promise<CheckInReading>;
}

export const CHECK_IN_READER_PORT = Symbol("CHECK_IN_READER_PORT");
