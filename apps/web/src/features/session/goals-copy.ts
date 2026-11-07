import type { Copy } from "@/lib/i18n/locale";

export interface GoalsCopy {
  goalsLabel: string;
  goal: Record<string, string>;
  checkInTitle: string;
  checkInBody: string;
  stop: string;
  keepGoing: string;
  goalsDone: (done: number, total: number) => string;
  /** The placement interview's progress, by part, never by score. */
  partOf: (part: number, total: number) => string;
  practice: string;
  practiceDone: (done: number, total: number) => string;
  saidRight: string;
  nextTime: string;
}

export const GOALS_COPY: Copy<GoalsCopy> = {
  "pt-BR": {
    goalsLabel: "Objetivos da conversa",
    goal: {
      yesterday: "Ontem",
      today: "Hoje",
      blockers: "Bloqueios",
      what_it_does: "O que o projeto faz",
      who_it_serves: "Para quem",
      key_decisions: "Decisões principais",
      status: "Status atual",
      sponsor_questions: "Responder 2 perguntas",
      problem: "O problema",
      change: "A mudança",
      testing: "Como testou",
      next_steps: "Próximos passos",
      usual_day: "Seu dia a dia",
      something_recent: "Algo recente",
      upcoming_plans: "Seus planos",
      story_setting: "Quando e onde",
      story_events: "O que aconteceu",
      story_ending: "Como terminou",
      opinion_view: "O que você acha",
      opinion_reasons: "Por quê",
      opinion_other_side: "O outro lado",
    },
    checkInTitle: "Quer parar aqui?",
    checkInBody: "Você pode encerrar e ver o resumo, ou continuar conversando.",
    stop: "Parar e ver o resumo",
    keepGoing: "Continuar",
    goalsDone: (done, total) => `Objetivos: ${done} de ${total}`,
    partOf: (part, total) => `Parte ${part} de ${total}`,
    practice: "Prática dos seus erros",
    practiceDone: (done, total) => `Você acertou ${done} de ${total}`,
    saidRight: "Acertou",
    nextTime: "Fica para a próxima",
  },
  en: {
    goalsLabel: "Conversation goals",
    goal: {
      yesterday: "Yesterday",
      today: "Today",
      blockers: "Blockers",
      what_it_does: "What it does",
      who_it_serves: "Who it serves",
      key_decisions: "Key decisions",
      status: "Current status",
      sponsor_questions: "Answer 2 questions",
      problem: "The problem",
      change: "The change",
      testing: "How you tested",
      next_steps: "Next steps",
      usual_day: "Your usual day",
      something_recent: "Something recent",
      upcoming_plans: "Your plans",
      story_setting: "When and where",
      story_events: "What happened",
      story_ending: "How it ended",
      opinion_view: "What you think",
      opinion_reasons: "Why",
      opinion_other_side: "The other side",
    },
    checkInTitle: "Stop here?",
    checkInBody: "You can end and see the summary, or keep talking.",
    stop: "Stop and see the summary",
    keepGoing: "Keep going",
    goalsDone: (done, total) => `Goals: ${done} of ${total}`,
    partOf: (part, total) => `Part ${part} of ${total}`,
    practice: "Practicing your mistakes",
    practiceDone: (done, total) => `You got ${done} of ${total} right`,
    saidRight: "Got it",
    nextTime: "Next time",
  },
};
