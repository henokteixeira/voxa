import type { Copy } from "@/lib/i18n/locale";

/** Copy for the daily mission: listen, take 3 expressions, do it, say it faster, review. */
export interface MissionCopy {
  todaysMission: string;
  stepOf: (step: number, total: number) => string;
  summary: (steps: number, minutes: number) => string;
  minutes: (n: number) => string;
  /** The step's name on Today, when the mission is done in parts. */
  stepNames: { listen: string; expressions: string; faster: string; review: string };
  close: string;
  start: string;
  continue: string;
  loadFailed: string;
  tryAgain: string;
  checkInLabel: string;
  checkInTitle: string;
  checkInBody: string;
  listenTitle: (speaker: string) => string;
  listenHint: (speaker: string) => string;
  listen: string;
  listening: string;
  listenAgain: string;
  showText: string;
  hideText: string;
  playFailed: string;
  expressionsTitle: string;
  sayIt: (phrase: string) => string;
  sayItAloud: string;
  checking: string;
  used: string;
  notUsed: string;
  notHeard: string;
  checkFailed: string;
  skip: string;
  typeInstead: string;
  yourSentence: string;
  send: string;
  taskTitle: (situation: string) => string;
  taskBody: string;
  fasterTitle: string;
  reviewTitle: string;
  doneLabel: string;
  doneTitle: string;
  doneBody: (situation: string) => string;
  talkMore: string;
  backToToday: string;
}

export const MISSION_COPY: Copy<MissionCopy> = {
  en: {
    todaysMission: "Today's mission",
    stepOf: (step, total) => `Step ${step} of ${total}`,
    summary: (steps, minutes) => `${steps} steps · ${minutes} min`,
    minutes: (n) => `${n} min`,
    stepNames: { listen: "Listen", expressions: "Take 3 expressions", faster: "Say it faster", review: "Review" },
    close: "Close",
    start: "Start",
    continue: "Continue",
    loadFailed: "Today's mission couldn't load right now.",
    tryAgain: "Try again",
    checkInLabel: "Check-in · every 2 weeks",
    checkInTitle: "Present your project",
    checkInBody: "2 min, then the mission",
    listenTitle: (speaker) => `Listen to ${speaker}`,
    listenHint: (speaker) => `Just listen. Try to catch how ${speaker} does it.`,
    listen: "Listen",
    listening: "Speaking",
    listenAgain: "Listen again",
    showText: "Show the text",
    hideText: "Hide the text",
    playFailed: "The audio couldn't play. Tap Listen to try again.",
    expressionsTitle: "3 expressions to use",
    sayIt: (phrase) => `Say “${phrase}” with something of yours.`,
    sayItAloud: "Listening",
    checking: "Checking…",
    used: "That's it.",
    notUsed: "I didn't hear it in that one. Try it again.",
    notHeard: "I didn't hear anything. Try it again.",
    checkFailed: "That one couldn't be checked. Try it again.",
    skip: "Skip",
    typeInstead: "Type instead",
    yourSentence: "Your sentence",
    send: "Send",
    taskTitle: (situation) => `Your turn: ${situation}`,
    taskBody: "Use the 3 expressions if they fit. The tutor helps as usual.",
    fasterTitle: "Same content, less time",
    reviewTitle: "Review",
    doneLabel: "Mission done",
    doneTitle: "See you tomorrow",
    doneBody: (situation) => situation,
    talkMore: "Talk more",
    backToToday: "Back to Today",
  },
  "pt-BR": {
    todaysMission: "Missão de hoje",
    stepOf: (step, total) => `Passo ${step} de ${total}`,
    summary: (steps, minutes) => `${steps} passos · ${minutes} min`,
    minutes: (n) => `${n} min`,
    stepNames: { listen: "Ouvir", expressions: "Pegar 3 expressões", faster: "Repetir mais rápido", review: "Revisar" },
    close: "Fechar",
    start: "Começar",
    continue: "Continuar",
    loadFailed: "Não deu para carregar a missão de hoje agora.",
    tryAgain: "Tentar de novo",
    checkInLabel: "Check-in · a cada 2 semanas",
    checkInTitle: "Apresentar seu projeto",
    checkInBody: "2 min, depois a missão",
    listenTitle: (speaker) => `Ouça ${speaker}`,
    listenHint: (speaker) => `Só ouça. Tente perceber como ${speaker} faz.`,
    listen: "Ouvir",
    listening: "Falando",
    listenAgain: "Ouvir de novo",
    showText: "Mostrar o texto",
    hideText: "Esconder o texto",
    playFailed: "Não deu para tocar o áudio. Toque em Ouvir para tentar de novo.",
    expressionsTitle: "3 expressões para usar",
    sayIt: (phrase) => `Diga “${phrase}” com algo seu.`,
    sayItAloud: "Ouvindo",
    checking: "Conferindo…",
    used: "Isso.",
    notUsed: "Não ouvi a expressão nessa. Tente de novo.",
    notHeard: "Não ouvi nada. Tente de novo.",
    checkFailed: "Não deu para conferir essa. Tente de novo.",
    skip: "Pular",
    typeInstead: "Escrever",
    yourSentence: "Sua frase",
    send: "Enviar",
    taskTitle: (situation) => `Sua vez: ${situation}`,
    taskBody: "Use as 3 expressões se couberem. O tutor ajuda como sempre.",
    fasterTitle: "O mesmo conteúdo, menos tempo",
    reviewTitle: "Revisão",
    doneLabel: "Missão feita",
    doneTitle: "Até amanhã",
    doneBody: (situation) => situation,
    talkMore: "Conversar mais",
    backToToday: "Voltar para Hoje",
  },
};
