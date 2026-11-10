import type { CheckInTopic } from "@voxa/contracts";
import type { Copy } from "@/lib/i18n/locale";

/** Copy for the check-in every 2 weeks. */
export interface CheckInCopy {
  label: string;
  every: string;
  todayTitle: string;
  todayBody: string;
  start: string;
  back: string;
  yourTask: string;
  task: string;
  noHelp: string;
  begin: (time: string) => string;
  left: (time: string) => string;
  listening: string;
  done: string;
  saving: string;
  notHeard: string;
  failed: string;
  notDue: string;
  retry: string;
  noMicrophone: string;
  loadFailed: string;
  firstTitle: string;
  firstBody: string;
  /** The title names the clearest gain; neutral when nothing got better. */
  /** `day`: the check-in's date when it isn't today's (opened from Progress). */
  gainTitle: (gain: { kind: "pace" | "pauses"; before: number; now: number } | null, day: string | null) => string;
  today: string;
  wordsPerMinute: string;
  longPauses: string;
  mistakesPer100Words: string;
  otherLanguageWords: string;
  linkingWordsPer100: string;
  hearBoth: (date: string, day: string | null) => string;
  dueNow: string;
  loading: string;
  latest: string;
  hearToday: string;
  playing: string;
  playFailed: string;
  finish: string;
  historyTitle: string;
  historyEvery: string;
  historyItem: (date: string, wordsPerMinute: number | null) => string;
  next: (date: string) => string;
  /** The second task: 1 minute on a topic never given before. */
  topicLabel: string;
  topics: Record<CheckInTopic, string>;
  topicListening: string;
  topicNext: string;
  topicLater: string;
  topicFirstTitle: string;
  topicFirstBody: string;
  topicGainTitle: (gain: { kind: "pace" | "pauses"; before: number; now: number } | null) => string;
}

export const CHECK_IN_COPY: Copy<CheckInCopy> = {
  en: {
    label: "Check-in",
    every: "Check-in · every 2 weeks",
    todayTitle: "Present your project in 2 minutes",
    todayBody: "The same task every time, to see how far you came.",
    start: "Start check-in",
    back: "Back",
    yourTask: "Your task",
    task: "Present your project: what it does, who it serves, and where it stands.",
    noHelp: "No hints and no corrections here. Mistakes don't count against you.",
    begin: (time) => `Start · ${time}`,
    left: (time) => `Listening · ${time} left`,
    listening: "Listening. Present your project.",
    done: "I'm done",
    saving: "Saving your check-in…",
    notHeard: "I didn't hear anything. Try it again.",
    failed: "Your check-in couldn't be saved.",
    notDue: "The next check-in isn't due yet.",
    retry: "Try again",
    noMicrophone: "The check-in needs the microphone.",
    loadFailed: "The check-in couldn't open right now.",
    firstTitle: "Your first check-in is saved.",
    firstBody: "In 2 weeks you'll do the same task and hear the difference.",
    gainTitle: (gain, day) => {
      const when = day ? `On ${day}` : "Today";
      if (!gain) return day ? "You told it again. Listen to how it sounded." : "You told it again. Listen to how it sounds now.";
      return gain.kind === "pace"
        ? `The time before, you said ${gain.before} words a minute. ${when}, ${gain.now}.`
        : `The time before, you paused ${gain.before} ${gain.before === 1 ? "time" : "times"}. ${when}, ${gain.now}.`;
    },
    today: "Today",
    wordsPerMinute: "Words per minute",
    longPauses: "Long pauses",
    mistakesPer100Words: "Mistakes per 100 words",
    otherLanguageWords: "Words in Portuguese",
    linkingWordsPer100: "Linking words per 100 (because, but…)",
    hearBoth: (date, day) => `Hear ${date}, then ${day ?? "today"}`,
    dueNow: "Next check-in: due now",
    loading: "Loading the check-in",
    latest: "latest",
    hearToday: "Hear your recording",
    playing: "Playing…",
    playFailed: "The recording couldn't play.",
    finish: "Done",
    historyTitle: "Check-ins · words per minute",
    historyEvery: "every 2 weeks",
    historyItem: (date, wpm) => `${date}: ${wpm ?? "no"} words per minute. Open this check-in`,
    next: (date) => `Next check-in: ${date}`,
    topicLabel: "A new topic · 1 minute",
    topics: {
      last_weekend: "Tell me about something you did last weekend.",
      problem_solved: "Tell me about a problem you solved recently, and how.",
      explain_skill: "Explain how to do something you know well.",
      change_wanted: "What would you change in your city or at work, and why?",
      place_remembered: "Tell me about a place you remember well.",
      person_admired: "Tell me about someone you admire, and why.",
      next_month: "What are your plans for the next month?",
      recommendation: "Recommend a book, a film or a series, and say why.",
      childhood_memory: "Tell me about a memory from your childhood.",
      hard_decision: "Tell me about a hard decision you made.",
    },
    topicListening: "Listening. Talk about the topic.",
    topicNext: "One more minute: a new topic",
    topicLater: "Not now",
    topicFirstTitle: "Your first new topic is saved.",
    topicFirstBody: "Each check-in brings a topic you haven't prepared, so you see how you talk off the cuff.",
    topicGainTitle: (gain) => {
      if (!gain) return "A new topic, with nothing prepared. Listen to how it sounds.";
      return gain.kind === "pace"
        ? `On the last new topic you said ${gain.before} words a minute. Today, ${gain.now}.`
        : `On the last new topic you paused ${gain.before} ${gain.before === 1 ? "time" : "times"}. Today, ${gain.now}.`;
    },
  },
  "pt-BR": {
    label: "Check-in",
    every: "Check-in · a cada 2 semanas",
    todayTitle: "Apresente seu projeto em 2 minutos",
    todayBody: "Sempre a mesma tarefa, para ver o quanto você avançou.",
    start: "Começar check-in",
    back: "Voltar",
    yourTask: "Sua tarefa",
    task: "Apresente seu projeto: o que ele faz, para quem é e em que pé está.",
    noHelp: "Sem pistas e sem correções aqui. Errar não conta contra você.",
    begin: (time) => `Começar · ${time}`,
    left: (time) => `Ouvindo · faltam ${time}`,
    listening: "Ouvindo. Apresente seu projeto.",
    done: "Terminei",
    saving: "Salvando seu check-in…",
    notHeard: "Não ouvi nada. Tente de novo.",
    failed: "Não deu para salvar seu check-in.",
    notDue: "O próximo check-in ainda não chegou.",
    retry: "Tentar de novo",
    noMicrophone: "O check-in precisa do microfone.",
    loadFailed: "Não deu para abrir o check-in agora.",
    firstTitle: "Seu primeiro check-in está salvo.",
    firstBody: "Daqui a 2 semanas você faz a mesma tarefa e ouve a diferença.",
    gainTitle: (gain, day) => {
      const when = day ? `Em ${day}` : "Hoje";
      if (!gain) return day ? "Você contou de novo. Ouça como soou." : "Você contou de novo. Ouça como soa agora.";
      return gain.kind === "pace"
        ? `Na vez anterior você falou ${gain.before} palavras por minuto. ${when}, ${gain.now}.`
        : `Na vez anterior você pausou ${gain.before} ${gain.before === 1 ? "vez" : "vezes"}. ${when}, ${gain.now}.`;
    },
    today: "Hoje",
    wordsPerMinute: "Palavras por minuto",
    longPauses: "Pausas longas",
    mistakesPer100Words: "Erros a cada 100 palavras",
    otherLanguageWords: "Palavras em português",
    linkingWordsPer100: "Palavras de ligação a cada 100 (because, but…)",
    hearBoth: (date, day) => `Ouvir ${date} e depois ${day ?? "hoje"}`,
    dueNow: "Próximo check-in: agora",
    loading: "Carregando o check-in",
    latest: "o mais recente",
    hearToday: "Ouvir sua gravação",
    playing: "Tocando…",
    playFailed: "Não deu para tocar a gravação.",
    finish: "Concluir",
    historyTitle: "Check-ins · palavras por minuto",
    historyEvery: "a cada 2 semanas",
    historyItem: (date, wpm) => `${date}: ${wpm ?? "sem"} palavras por minuto. Abrir este check-in`,
    next: (date) => `Próximo check-in: ${date}`,
    topicLabel: "Um tema novo · 1 minuto",
    topics: {
      last_weekend: "Conte algo que você fez no último fim de semana.",
      problem_solved: "Conte um problema que você resolveu há pouco, e como.",
      explain_skill: "Explique como fazer algo que você sabe fazer bem.",
      change_wanted: "O que você mudaria na sua cidade ou no trabalho, e por quê?",
      place_remembered: "Fale de um lugar de que você se lembra bem.",
      person_admired: "Fale de alguém que você admira, e por quê.",
      next_month: "Quais são seus planos para o próximo mês?",
      recommendation: "Recomende um livro, filme ou série, e diga por quê.",
      childhood_memory: "Conte uma lembrança da sua infância.",
      hard_decision: "Conte uma decisão difícil que você tomou.",
    },
    topicListening: "Ouvindo. Fale sobre o tema.",
    topicNext: "Mais 1 minuto: um tema novo",
    topicLater: "Agora não",
    topicFirstTitle: "Seu primeiro tema novo está salvo.",
    topicFirstBody: "Cada check-in traz um tema que você não preparou, para ver como você fala de improviso.",
    topicGainTitle: (gain) => {
      if (!gain) return "Um tema novo, sem nada preparado. Ouça como soa.";
      return gain.kind === "pace"
        ? `No último tema novo você falou ${gain.before} palavras por minuto. Hoje, ${gain.now}.`
        : `No último tema novo você pausou ${gain.before} ${gain.before === 1 ? "vez" : "vezes"}. Hoje, ${gain.now}.`;
    },
  },
};
