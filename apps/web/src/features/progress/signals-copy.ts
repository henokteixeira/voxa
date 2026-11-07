import type { SignalName } from "@/lib/api";
import type { Copy } from "@/lib/i18n/locale";

export type SignalKey = Exclude<SignalName, "selfCorrectionRate">;

interface SignalText {
  name: string;
  /** Which way is better, so a falling line never reads as bad by mistake. */
  better: string;
  format: (value: number, locale: string) => string;
}

export interface SignalsCopy {
  title: (sessions: number) => string;
  note: string;
  trendLabel: (name: string, values: string[]) => string;
  notMeasured: string;
  oneSession: string;
  emptyTitle: string;
  emptyBody: string;
  unavailableTitle: string;
  unavailableBody: string;
  signals: Record<SignalKey, SignalText>;
}

const percent = (value: number, locale: string) => new Intl.NumberFormat(locale, { style: "percent" }).format(value);
const whole = (value: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
const decimal = (value: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
const seconds = (value: number, locale: string) => `${decimal(value / 1000, locale)} s`;

export const SIGNALS_COPY: Copy<SignalsCopy> = {
  en: {
    title: (n) => `Your last ${n} sessions`,
    note: "Each dot is one of your sessions, oldest on the left. Some days are harder; the trend is what counts.",
    trendLabel: (name, values) => `${name}, oldest to newest: ${values.join(", ")}`,
    notMeasured: "not measured",
    oneSession: "1 session so far",
    emptyTitle: "Nothing to show yet",
    emptyBody: "Your fluency signals appear after a few sessions. Progress comes from practice: every session counts, mistakes included.",
    unavailableTitle: "Couldn't load your signals",
    unavailableBody: "Voxa's server didn't answer. Your sessions are safe; try again in a moment.",
    signals: {
      unaidedShare: { name: "Answers without help", better: "higher is better", format: percent },
      wordsPerMinute: { name: "Pace (words a minute)", better: "higher is better", format: whole },
      longPausesPerMinute: { name: "Long pauses a minute", better: "lower is better", format: decimal },
      averagePauseMs: { name: "Pause before answering", better: "lower is better", format: seconds },
      mistakesPer100Words: { name: "Mistakes per 100 words", better: "lower is better", format: decimal },
    },
  },
  "pt-BR": {
    title: (n) => `Suas últimas ${n} sessões`,
    note: "Cada ponto é uma sessão sua, a mais antiga à esquerda. Alguns dias são mais difíceis; o que conta é a tendência.",
    trendLabel: (name, values) => `${name}, da mais antiga para a mais recente: ${values.join(", ")}`,
    notMeasured: "não medido",
    oneSession: "1 sessão até agora",
    emptyTitle: "Nada para mostrar ainda",
    emptyBody:
      "Seus sinais de fluência aparecem depois de algumas sessões. O progresso vem da prática: toda sessão conta, com erros e tudo.",
    unavailableTitle: "Não deu para carregar seus sinais",
    unavailableBody: "O servidor do Voxa não respondeu. Suas sessões estão guardadas; tente de novo daqui a pouco.",
    signals: {
      unaidedShare: { name: "Respostas sem ajuda", better: "quanto mais, melhor", format: percent },
      wordsPerMinute: { name: "Ritmo (palavras por minuto)", better: "quanto mais, melhor", format: whole },
      longPausesPerMinute: { name: "Pausas longas por minuto", better: "quanto menos, melhor", format: decimal },
      averagePauseMs: { name: "Pausa antes de responder", better: "quanto menos, melhor", format: seconds },
      mistakesPer100Words: { name: "Erros a cada 100 palavras", better: "quanto menos, melhor", format: decimal },
    },
  },
};
