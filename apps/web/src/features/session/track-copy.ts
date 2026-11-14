import type { TrackSupport } from "@/lib/api";
import type { Copy } from "@/lib/i18n/locale";

export interface TrackCopy {
  /** "Step 2 of 4". */
  stepOf: (number: number, total: number) => string;
  /** The last step's name: putting it all together. */
  retell: string;
  /** The label over the words the tutor gave, by what they are; `start` is also the sentence start outside the script. */
  words: Record<Exclude<TrackSupport, "alone"> | "retell", string>;
  keyWords: string;
  /** Read for a ___ blank. */
  blank: string;
}

export const TRACK_COPY: Copy<TrackCopy> = {
  "pt-BR": {
    stepOf: (number, total) => `Passo ${number} de ${total}`,
    retell: "Juntar tudo",
    words: {
      example: "Exemplo · troque pelo seu",
      frame: "Complete a frase",
      start: "Comece assim",
      retell: "Fale tudo junto, parte por parte",
    },
    keyWords: "Palavras que ajudam",
    blank: "espaço para completar",
  },
  en: {
    stepOf: (number, total) => `Step ${number} of ${total}`,
    retell: "Put it all together",
    words: {
      example: "Example · make it yours",
      frame: "Complete the sentence",
      start: "Start like this",
      retell: "Say it all together, part by part",
    },
    keyWords: "Words that help",
    blank: "blank to complete",
  },
};
