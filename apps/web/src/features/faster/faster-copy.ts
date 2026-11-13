import type { Copy } from "@/lib/i18n/locale";

/** Copy for "say it faster": the same content told twice, the second time with less time, then how the pace changed. */
export interface FasterCopy {
  title: string;
  subtitle: string;
  task: string;
  noCorrections: string;
  start: (time: string) => string;
  left: (time: string) => string;
  done: string;
  saving: string;
  notHeard: string;
  failed: string;
  retry: string;
  skip: string;
  noMicrophone: string;
  loadFailed: string;
  roundOf: (round: number, total: number) => string;
  listening: string;
  result: (paceChangePercent: number | null, fewerLongPauses: boolean) => string;
  wordsPerMinute: string;
  round: (n: number) => string;
  longPauses: (counts: number[]) => string;
  continue: string;
}

export const FASTER_COPY: Copy<FasterCopy> = {
  en: {
    title: "Say it faster",
    subtitle: "Same content, less time",
    task: "Tell what you said in the conversation again, in your own words.",
    noCorrections: "No corrections now. Just keep going.",
    start: (time) => `Start · ${time}`,
    left: (time) => `Listening · ${time} left`,
    done: "I'm done",
    saving: "Saving the round…",
    notHeard: "I didn't hear anything in this round. Try it again.",
    failed: "This round couldn't be saved.",
    retry: "Try again",
    skip: "Skip",
    noMicrophone: "Say it faster needs the microphone.",
    loadFailed: "Say it faster couldn't open right now.",
    roundOf: (round, total) => `Round ${round} of ${total}`,
    listening: "Listening. Tell it again.",
    result: (percent, fewer) => {
      if (percent !== null && percent > 0) return `You said it ${percent}% faster${fewer ? ", with fewer long pauses" : ""}.`;
      if (fewer) return "You said it with fewer long pauses.";
      return "You told it twice. The repetition is what trains fluency.";
    },
    wordsPerMinute: "Words per minute",
    round: (n) => `Round ${n}`,
    longPauses: (counts) => `Long pauses: ${counts.join(" → ")}`,
    continue: "Continue",
  },
  "pt-BR": {
    title: "Repetir mais rápido",
    subtitle: "O mesmo conteúdo, menos tempo",
    task: "Conte de novo o que você falou na conversa, com suas palavras.",
    noCorrections: "Sem correções agora. Só continue falando.",
    start: (time) => `Começar · ${time}`,
    left: (time) => `Ouvindo · faltam ${time}`,
    done: "Terminei",
    saving: "Salvando a rodada…",
    notHeard: "Não ouvi nada nesta rodada. Tente de novo.",
    failed: "Não deu para salvar esta rodada.",
    retry: "Tentar de novo",
    skip: "Pular",
    noMicrophone: "Repetir mais rápido precisa do microfone.",
    loadFailed: "Não deu para abrir o Repetir mais rápido agora.",
    roundOf: (round, total) => `Rodada ${round} de ${total}`,
    listening: "Ouvindo. Conte de novo.",
    result: (percent, fewer) => {
      if (percent !== null && percent > 0) return `Você falou ${percent}% mais rápido${fewer ? ", com menos pausas longas" : ""}.`;
      if (fewer) return "Você falou com menos pausas longas.";
      return "Você contou 2 vezes. É a repetição que treina a fluência.";
    },
    wordsPerMinute: "Palavras por minuto",
    round: (n) => `Rodada ${n}`,
    longPauses: (counts) => `Pausas longas: ${counts.join(" → ")}`,
    continue: "Continuar",
  },
};
