import type { Copy } from "@/lib/i18n/locale";
import type { XpReason } from "@/lib/api";

export interface XpCopy {
  todayGoal: string;
  ringLabel: (earned: number, goal: number) => string;
  /** The XP on Today's goal bar. */
  xpOf: (earned: number, goal: number) => string;
  goalMet: string;
  streak: (days: number) => string;
  /** The streak on Today's one-line goal. */
  streakShort: (days: number) => string;
  /** Toasts during the session. */
  fixedIt: string;
  goalCovered: string;
  sessionXp: string;
  award: Record<XpReason, (count: number) => string>;
  dailyGoalMet: string;
  newRecord: string;
}

export const XP_COPY: Copy<XpCopy> = {
  en: {
    todayGoal: "Today's goal",
    ringLabel: (e, g) => `${e} of ${g} XP today`,
    xpOf: (e, g) => `${e} / ${g} XP`,
    goalMet: "Goal met for today.",
    streak: (d) => (d === 1 ? "1 day in a row" : `${d} days in a row`),
    streakShort: (d) => (d === 1 ? "1 day" : `${d} days`),
    fixedIt: "Fixed it yourself",
    goalCovered: "Goal covered",
    sessionXp: "XP this session",
    award: {
      practice_minute: (n) => (n === 1 ? "1 minute talking" : `${n} minutes talking`),
      goal_covered: (n) => (n === 1 ? "1 goal covered" : `${n} goals covered`),
      self_corrected: (n) => (n === 1 ? "Fixed 1 mistake yourself" : `Fixed ${n} mistakes yourself`),
      personal_record: () => "Your fastest pace yet",
    },
    dailyGoalMet: "Daily goal met",
    newRecord: "New personal record",
  },
  "pt-BR": {
    todayGoal: "Meta de hoje",
    ringLabel: (e, g) => `${e} de ${g} XP hoje`,
    xpOf: (e, g) => `${e} / ${g} XP`,
    goalMet: "Meta de hoje batida.",
    streak: (d) => (d === 1 ? "1 dia seguido" : `${d} dias seguidos`),
    streakShort: (d) => (d === 1 ? "1 dia" : `${d} dias`),
    fixedIt: "Você se corrigiu",
    goalCovered: "Objetivo coberto",
    sessionXp: "XP desta sessão",
    award: {
      practice_minute: (n) => (n === 1 ? "1 minuto conversando" : `${n} minutos conversando`),
      goal_covered: (n) => (n === 1 ? "1 objetivo coberto" : `${n} objetivos cobertos`),
      self_corrected: (n) => (n === 1 ? "Corrigiu 1 erro sozinho" : `Corrigiu ${n} erros sozinho`),
      personal_record: () => "Seu ritmo mais rápido até agora",
    },
    dailyGoalMet: "Meta do dia batida",
    newRecord: "Novo recorde pessoal",
  },
};
