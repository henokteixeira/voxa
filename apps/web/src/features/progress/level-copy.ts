import type { CefrLevel } from "@/lib/api";
import type { Copy } from "@/lib/i18n/locale";

export interface LevelCopy {
  levelTitle: string;
  estimateLabel: string;
  levelOf: (level: string) => string;
  /** How the level was set, with its date. */
  source: (source: "placement" | "manual" | "step_change", date: string) => string;
  /** How much help sessions give at each level, in the learner's words. */
  help: Record<CefrLevel, string>;
  /** What a speaker at each level can do (CEFR spoken production, in plain words). */
  canDo: Record<CefrLevel, string>;
  why: (level: string) => string;
  noticedTitle: string;
  youCan: string;
  nextStep: (level: string) => string;
  notAGrade: string;
  back: string;
  noLevelTitle: string;
  noLevelBody: string;
  startPlacement: string;
  redoPlacement: string;
  placementDue: string;
  changeLevel: string;
  sheetTitle: string;
  save: string;
  saveFailed: string;
  setByHand: string;
  unavailableTitle: string;
  unavailableBody: string;
  tryAgain: string;
  stepChange: {
    title: (direction: "up" | "down", to: string) => string;
    body: (direction: "up" | "down") => string;
    confirm: string;
    notNow: string;
  };
}

export const LEVEL_COPY: Copy<LevelCopy> = {
  en: {
    levelTitle: "Your speaking level",
    estimateLabel: "Speaking level · estimate",
    levelOf: (level) => `Level ${level}`,
    source: (source, date) =>
      source === "placement" ? `From the level chat, ${date}` : source === "manual" ? `Set by you, ${date}` : `Updated ${date}`,
    help: {
      A1: "build each sentence with me",
      A2: "guided, light",
      B1: "talk, a start when stuck",
      B2: "talk, hints as today",
      C1: "harder questions",
      C2: "harder questions",
    },
    canDo: {
      A1: "Say who you are and what you do, in simple words, with help.",
      A2: "Talk about your routine and your work in short sentences.",
      B1: "Explain what you did and why, in simple connected sentences.",
      B2: "Discuss work topics in detail and give reasons for your opinion.",
      C1: "Speak fluently and flexibly, even about complex topics.",
      C2: "Speak with ease and precision about almost anything.",
    },
    why: (level) => `Why ${level}?`,
    noticedTitle: "What the tutor noticed",
    youCan: "You can",
    nextStep: (level) => `Next step (${level})`,
    notAGrade: "An estimate, not a test. It can be wrong, and it only picks how much help your sessions give.",
    back: "Back",
    noLevelTitle: "Find your speaking level",
    noLevelBody: "A short, relaxed conversation about your work. No corrections, nothing to pass.",
    startPlacement: "Start the conversation",
    redoPlacement: "Redo the level chat",
    placementDue: "It's been 4 weeks: a new level chat shows how far you've come.",
    changeLevel: "Change my level",
    sheetTitle: "Your speaking level",
    save: "Save",
    saveFailed: "Couldn't save. Try again.",
    setByHand: "Or set it by hand",
    unavailableTitle: "Couldn't load your level",
    unavailableBody: "Voxa's server didn't answer. Your level is safe; try again in a moment.",
    tryAgain: "Try again",
    stepChange: {
      title: (direction, to) => (direction === "up" ? `Ready for a bit less help? (${to})` : `A bit more help for a while? (${to})`),
      body: (direction) =>
        direction === "up"
          ? "In your last 3 measured sessions, at least 8 in 10 of your answers needed no help, and long pauses didn't grow. Sessions would give a little less help."
          : "In your last 3 measured sessions, most answers needed help. That's normal while you build up. Sessions would give a little more help.",
      confirm: "Yes, try it",
      notNow: "Not yet",
    },
  },
  "pt-BR": {
    levelTitle: "Seu nível de fala",
    estimateLabel: "Nível de fala · estimativa",
    levelOf: (level) => `Nível ${level}`,
    source: (source, date) =>
      source === "placement" ? `Pela conversa de nível, ${date}` : source === "manual" ? `Ajustado por você, ${date}` : `Atualizado em ${date}`,
    help: {
      A1: "monto cada frase com você",
      A2: "guiado, leve",
      B1: "conversa, um começo quando travar",
      B2: "conversa, dicas como hoje",
      C1: "perguntas mais difíceis",
      C2: "perguntas mais difíceis",
    },
    canDo: {
      A1: "Dizer quem você é e o que faz, com palavras simples e com ajuda.",
      A2: "Falar da sua rotina e do seu trabalho em frases curtas.",
      B1: "Explicar o que você fez e por quê, em frases simples e ligadas.",
      B2: "Discutir temas do trabalho em detalhe e justificar sua opinião.",
      C1: "Falar com fluência e flexibilidade, mesmo sobre temas complexos.",
      C2: "Falar com facilidade e precisão sobre quase tudo.",
    },
    why: (level) => `Por que ${level}?`,
    noticedTitle: "O que o tutor percebeu",
    youCan: "Você consegue",
    nextStep: (level) => `Próximo passo (${level})`,
    notAGrade: "Uma estimativa, não uma prova. Pode estar errada, e serve só para escolher quanta ajuda as sessões dão.",
    back: "Voltar",
    noLevelTitle: "Descubra seu nível de fala",
    noLevelBody: "Uma conversa curta e tranquila sobre o seu trabalho. Sem correções, nada para passar.",
    startPlacement: "Começar a conversa",
    redoPlacement: "Refazer a conversa de nível",
    placementDue: "Já faz 4 semanas: uma nova conversa de nível mostra o quanto você evoluiu.",
    changeLevel: "Mudar meu nível",
    sheetTitle: "Seu nível de fala",
    save: "Salvar",
    saveFailed: "Não deu para salvar. Tente de novo.",
    setByHand: "Ou escolha à mão",
    unavailableTitle: "Não deu para carregar seu nível",
    unavailableBody: "O servidor do Voxa não respondeu. Seu nível está guardado; tente de novo daqui a pouco.",
    tryAgain: "Tentar de novo",
    stepChange: {
      title: (direction, to) => (direction === "up" ? `Pronto para um pouco menos de ajuda? (${to})` : `Um pouco mais de ajuda por um tempo? (${to})`),
      body: (direction) =>
        direction === "up"
          ? "Nas suas últimas 3 sessões medidas, pelo menos 8 em cada 10 respostas não precisaram de ajuda, e as pausas longas não aumentaram. As sessões dariam um pouco menos de ajuda."
          : "Nas suas últimas 3 sessões medidas, a maioria das respostas precisou de ajuda. Isso é normal enquanto você ganha base. As sessões dariam um pouco mais de ajuda.",
      confirm: "Sim, vamos tentar",
      notNow: "Ainda não",
    },
  },
};
