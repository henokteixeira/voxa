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
  gainTitle: (gain: { kind: "pace" | "pauses"; before: number; now: number } | null) => string;
  today: string;
  wordsPerMinute: string;
  longPauses: string;
  hearBoth: (date: string) => string;
  hearToday: string;
  playing: string;
  playFailed: string;
  finish: string;
  historyTitle: string;
  historyEvery: string;
  historyItem: (date: string, wordsPerMinute: number | null) => string;
  next: (date: string) => string;
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
    gainTitle: (gain) =>
      !gain
        ? "You told it again. Listen to how it sounds now."
        : gain.kind === "pace"
          ? `Last time you said ${gain.before} words a minute. Today, ${gain.now}.`
          : `Last time you paused ${gain.before} ${gain.before === 1 ? "time" : "times"}. Today, ${gain.now}.`,
    today: "Today",
    wordsPerMinute: "Words per minute",
    longPauses: "Long pauses",
    hearBoth: (date) => `Hear ${date}, then today`,
    hearToday: "Hear your recording",
    playing: "Playing…",
    playFailed: "The recording couldn't play.",
    finish: "Done",
    historyTitle: "Check-ins · words per minute",
    historyEvery: "every 2 weeks",
    historyItem: (date, wpm) => `${date}: ${wpm ?? "no"} words per minute. Open this check-in`,
    next: (date) => `Next check-in: ${date}`,
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
    gainTitle: (gain) =>
      !gain
        ? "Você contou de novo. Ouça como soa agora."
        : gain.kind === "pace"
          ? `Da última vez você falou ${gain.before} palavras por minuto. Hoje, ${gain.now}.`
          : `Da última vez você pausou ${gain.before} ${gain.before === 1 ? "vez" : "vezes"}. Hoje, ${gain.now}.`,
    today: "Hoje",
    wordsPerMinute: "Palavras por minuto",
    longPauses: "Pausas longas",
    hearBoth: (date) => `Ouvir ${date} e depois hoje`,
    hearToday: "Ouvir sua gravação",
    playing: "Tocando…",
    playFailed: "Não deu para tocar a gravação.",
    finish: "Concluir",
    historyTitle: "Check-ins · palavras por minuto",
    historyEvery: "a cada 2 semanas",
    historyItem: (date, wpm) => `${date}: ${wpm ?? "sem"} palavras por minuto. Abrir este check-in`,
    next: (date) => `Próximo check-in: ${date}`,
  },
};
