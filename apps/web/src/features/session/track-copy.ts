import type { TrackStage } from "@/lib/api";
import type { Copy } from "@/lib/i18n/locale";

export interface TrackCopy {
  /** What the learner does at each stage of the guided track. */
  stage: Record<TrackStage, string>;
  stepOf: (number: number, total: number) => string;
  showSentence: string;
  /** The label over the words the tutor gave, by stage; `start` is the sentence start outside the track (B1). */
  words: Record<"model" | "swap" | "extend" | "start", string>;
}

export const TRACK_COPY: Copy<TrackCopy> = {
  "pt-BR": {
    stage: {
      model: "Repita comigo",
      swap: "Agora do seu jeito",
      extend: "Some mais uma parte",
      answer: "Sua vez, sem modelo",
      again: "Mais uma vez, com calma",
    },
    stepOf: (number, total) => `Passo ${number} de ${total}`,
    showSentence: "Mostrar a frase",
    words: {
      model: "A frase",
      swap: "Troque pelo que você fez",
      extend: "Some mais uma parte",
      start: "Termine a frase",
    },
  },
  en: {
    stage: {
      model: "Say it after me",
      swap: "Make it yours",
      extend: "Add one more part",
      answer: "Your turn, no model",
      again: "Once more, smoother",
    },
    stepOf: (number, total) => `Step ${number} of ${total}`,
    showSentence: "Show the sentence",
    words: {
      model: "The sentence",
      swap: "Swap in what you did",
      extend: "Add one more part",
      start: "Finish the sentence",
    },
  },
};
