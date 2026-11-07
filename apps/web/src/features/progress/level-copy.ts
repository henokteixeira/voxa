import type { Copy } from "@/lib/i18n/locale";

export interface LevelCopy {
  levelTitle: string;
  estimate: string;
  levelOf: (level: string) => string;
  /** How the level was set, with its date. */
  source: (source: "placement" | "manual" | "step_change", date: string) => string;
  evidenceLabel: string;
  notAGrade: string;
  noLevelTitle: string;
  noLevelBody: string;
  startPlacement: string;
  redoPlacement: string;
  placementDue: string;
  adjust: string;
  adjustLabel: string;
  save: string;
  cancel: string;
  saveFailed: string;
  setByHand: string;
  unavailableTitle: string;
  unavailableBody: string;
  tryAgain: string;
  stepChange: {
    title: (direction: "up" | "down", to: string) => string;
    body: (direction: "up" | "down") => string;
    confirm: (to: string) => string;
    notNow: string;
  };
}

export const LEVEL_COPY: Copy<LevelCopy> = {
  en: {
    levelTitle: "Your speaking level",
    estimate: "Estimated level",
    levelOf: (level) => `Level ${level}`,
    source: (source, date) =>
      source === "placement" ? `From the placement interview, ${date}` : source === "manual" ? `Set by you, ${date}` : `Updated ${date}`,
    evidenceLabel: "What you said",
    notAGrade: "An estimate, not a grade: it only picks how much help your sessions give.",
    noLevelTitle: "Find your speaking level",
    noLevelBody: "A short, relaxed conversation about your work. No corrections, nothing to pass.",
    startPlacement: "Start the conversation",
    redoPlacement: "Do the placement again",
    placementDue: "It's been 4 weeks: a new placement shows how far you've come.",
    adjust: "Adjust the level",
    adjustLabel: "Level",
    save: "Save",
    cancel: "Cancel",
    saveFailed: "Couldn't save. Try again.",
    setByHand: "Or set it by hand",
    unavailableTitle: "Couldn't load your level",
    unavailableBody: "Voxa's server didn't answer. Your level is safe; try again in a moment.",
    tryAgain: "Try again",
    stepChange: {
      title: (direction, to) => (direction === "up" ? `Ready for ${to}?` : `Try ${to} for a while?`),
      body: (direction) =>
        direction === "up"
          ? "In your last 3 measured sessions, at least 8 in 10 of your answers needed no help, and long pauses didn't grow. Sessions would give a little less help."
          : "In your last 3 measured sessions, most answers needed help. That's normal while you build up. Sessions would give a little more help.",
      confirm: (to) => `Move to ${to}`,
      notNow: "Not now",
    },
  },
  "pt-BR": {
    levelTitle: "Seu nível de fala",
    estimate: "Nível estimado",
    levelOf: (level) => `Nível ${level}`,
    source: (source, date) =>
      source === "placement" ? `Pela entrevista de nivelamento, ${date}` : source === "manual" ? `Ajustado por você, ${date}` : `Atualizado em ${date}`,
    evidenceLabel: "O que você disse",
    notAGrade: "É uma estimativa, não uma nota: serve só para escolher quanta ajuda as sessões dão.",
    noLevelTitle: "Descubra seu nível de fala",
    noLevelBody: "Uma conversa curta e tranquila sobre o seu trabalho. Sem correções, nada para passar.",
    startPlacement: "Começar a conversa",
    redoPlacement: "Refazer o nivelamento",
    placementDue: "Já faz 4 semanas: um novo nivelamento mostra o quanto você evoluiu.",
    adjust: "Ajustar o nível",
    adjustLabel: "Nível",
    save: "Salvar",
    cancel: "Cancelar",
    saveFailed: "Não deu para salvar. Tente de novo.",
    setByHand: "Ou escolha à mão",
    unavailableTitle: "Não deu para carregar seu nível",
    unavailableBody: "O servidor do Voxa não respondeu. Seu nível está guardado; tente de novo daqui a pouco.",
    tryAgain: "Tentar de novo",
    stepChange: {
      title: (direction, to) => (direction === "up" ? `Vamos para o ${to}?` : `Que tal o ${to} por um tempo?`),
      body: (direction) =>
        direction === "up"
          ? "Nas suas últimas 3 sessões medidas, pelo menos 8 em cada 10 respostas não precisaram de ajuda, e as pausas longas não aumentaram. As sessões dariam um pouco menos de ajuda."
          : "Nas suas últimas 3 sessões medidas, a maioria das respostas precisou de ajuda. Isso é normal enquanto você ganha base. As sessões dariam um pouco mais de ajuda.",
      confirm: (to) => `Mudar para ${to}`,
      notNow: "Agora não",
    },
  },
};
