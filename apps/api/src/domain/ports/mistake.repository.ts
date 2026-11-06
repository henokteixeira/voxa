export interface Mistake {
  id: string;
  language: string;
  original: string;
  correction: string;
  category: string;
  occurrences: number;
  lastSeenAt: Date;
}

export interface NewMistake {
  language: string;
  original: string;
  correction: string;
  category: string;
}

/** Banco de erros e expressões. Implementação concreta fica em infra/. */
export interface MistakeRepository {
  record(mistake: NewMistake): Promise<Mistake>;
  mostFrequent(language: string, limit: number): Promise<Mistake[]>;
}

export const MISTAKE_REPOSITORY = Symbol("MISTAKE_REPOSITORY");
