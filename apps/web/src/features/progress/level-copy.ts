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
  },
};
