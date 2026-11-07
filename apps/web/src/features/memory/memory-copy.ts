import type { FactTopic } from "@/lib/api";
import type { Copy } from "@/lib/i18n/locale";

export interface MemoryCopy {
  title: string;
  intro: string;
  back: string;
  empty: string;
  topics: Record<FactTopic, string>;
  edit: string;
  editLabel: string;
  save: string;
  cancel: string;
  remove: string;
  confirmRemove: string;
  keep: string;
  loadFailed: string;
  retry: string;
  saveFailed: string;
  removeFailed: string;
  /** The Settings row that opens the page. */
  settingsLink: string;
  settingsHint: string;
}

export const MEMORY_COPY: Copy<MemoryCopy> = {
  en: {
    title: "What Voxa knows about you",
    intro: "Things you told the tutor. It brings them up in later conversations. Change or delete anything.",
    back: "Back",
    empty: "Nothing yet. As you talk, the tutor remembers what you tell it about your life.",
    topics: { work: "Work", projects: "Projects", people: "People", interests: "Interests", life: "Life", goals: "Goals" },
    edit: "Edit",
    editLabel: "Fact",
    save: "Save",
    cancel: "Cancel",
    remove: "Delete",
    confirmRemove: "Delete this? The tutor will forget it.",
    keep: "Keep",
    loadFailed: "Couldn't load it. Check that Voxa's server is running.",
    retry: "Try again",
    saveFailed: "Couldn't save it. Try again.",
    removeFailed: "Couldn't delete it. Try again.",
    settingsLink: "What Voxa knows about you",
    settingsHint: "See, change or delete what the tutor remembers.",
  },
  "pt-BR": {
    title: "O que o Voxa sabe sobre você",
    intro: "Coisas que você contou ao tutor. Ele as retoma nas próximas conversas. Mude ou apague o que quiser.",
    back: "Voltar",
    empty: "Nada ainda. Conforme você conversa, o tutor guarda o que você conta sobre a sua vida.",
    topics: { work: "Trabalho", projects: "Projetos", people: "Pessoas", interests: "Interesses", life: "Vida", goals: "Metas" },
    edit: "Editar",
    editLabel: "Fato",
    save: "Salvar",
    cancel: "Cancelar",
    remove: "Apagar",
    confirmRemove: "Apagar isto? O tutor vai esquecer.",
    keep: "Manter",
    loadFailed: "Não deu para carregar. Veja se o servidor do Voxa está rodando.",
    retry: "Tentar de novo",
    saveFailed: "Não deu para salvar. Tente de novo.",
    removeFailed: "Não deu para apagar. Tente de novo.",
    settingsLink: "O que o Voxa sabe sobre você",
    settingsHint: "Veja, mude ou apague o que o tutor lembra.",
  },
};
