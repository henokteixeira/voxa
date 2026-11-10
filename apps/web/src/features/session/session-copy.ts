import type { BallState } from "@/components/voice-ball";
import { STATE_LABEL } from "@/components/voice-ball-state";
import type { Copy } from "@/lib/i18n/locale";
import type { FailureCode, SessionState } from "./session-state";

interface FailureCopy {
  title: string;
  body: string;
  action: string;
  steps?: string[];
  command?: string;
}

interface StageCopy {
  waiting: string;
  paused: string;
  nice: string;
  speaking: string;
  sayOnce: string;
  hintFirst: string;
  hintSecond: string;
  listening: string;
  listeningHint: string;
  yourTurn: string;
  missed: string;
  justTalk: string;
  thinking: string;
}

export interface SessionCopy {
  stage: StageCopy;
  failure: Record<FailureCode, FailureCopy>;
  page: {
    saving: string;
    pause: string;
    showTranscript: string;
    hideTranscript: string;
    transcript: string;
    sendNow: string;
    stopTutor: string;
    tapToHear: string;
    ballTip: string;
    yourAnswer: string;
    send: string;
    typeInstead: string;
    endSession: string;
    backToToday: string;
    paused: string;
    resume: string;
    repeatLast: string;
    /** On the failure card when the learner's answer is kept for the retry. */
    keptAnswer: string;
    retrying: (attempt: number, of: number) => string;
    /** Near the longest turn, for screen readers: what happens there, without pressure. */
    turnLimit: (max: string) => string;
  };
  parts: {
    tutor: string;
    you: string;
    showTutorLine: string;
    hideTutorLine: string;
    youSaid: string;
    hint: string;
    hintOf: (step: number) => string;
    correctForm: string;
    savedToBank: string;
    help: string;
  };
}

/** The ball's state and the line under it, from the session state. */
export function stageFor(state: SessionState, copy: StageCopy): { ball: BallState; label: string; hint?: string } {
  const yourTurn = state.phase === "listening" || state.phase === "hearing";
  if (state.phase === "failed") return { ball: "idle", label: copy.waiting };
  if (state.phase === "paused") return { ball: "idle", label: copy.paused };
  if (state.fixed && !yourTurn) return { ball: "success", label: copy.nice };
  if (state.phase === "speaking") return { ball: "speaking", label: copy.speaking };
  if (yourTurn && state.revealed) return { ball: "listening", label: copy.sayOnce };
  if (yourTurn && state.hintStep > 0) {
    return { ball: "hint", label: state.hintStep === 1 ? copy.hintFirst : copy.hintSecond };
  }
  if (state.phase === "hearing") {
    return { ball: "listening", label: copy.listening, hint: copy.listeningHint };
  }
  if (state.phase === "listening") {
    return { ball: "listening", label: copy.yourTurn, hint: state.missed ? copy.missed : copy.justTalk };
  }
  return { ball: "thinking", label: copy.thinking };
}

export function labelClass(ball: BallState): string {
  return STATE_LABEL[ball].className;
}

const MIC_STEPS = [
  "Click the lock icon next to the address.",
  "Set Microphone to Allow.",
  "Come back and tap Try again.",
];

const FAILURE_EN: Record<FailureCode, FailureCopy> = {
  mic_blocked: { title: "Voxa can't hear you", body: "The browser is blocking the microphone.", action: "Try again", steps: MIC_STEPS },
  mic_busy: {
    title: "The microphone is busy",
    body: "Another app may be using it. Close that app, or pick another microphone, then try again.",
    action: "Try again",
  },
  mic_missing: { title: "No microphone found", body: "Plug in a microphone or a headset, then try again.", action: "Try again" },
  mic_unsupported: { title: "This browser can't record", body: "Open Voxa in a recent Chrome, Edge or Safari.", action: "Try again" },
  start_failed: {
    title: "The session didn't start",
    body: "Check that Voxa is running on your PC:",
    command: "docker compose up",
    action: "Try again",
  },
  tutor_start_failed: {
    title: "The tutor didn't answer",
    body: "Check the Claude API key in .env and the account's credits. The reason is in the API log:",
    command: "docker compose logs api",
    action: "Try again",
  },
  voice_unavailable: {
    title: "The voice server isn't running",
    body: "Speech recognition and the tutor's voice run on your PC. Start it there:",
    command: "docker compose up voice",
    action: "Check again",
  },
  tutor_unavailable: {
    title: "The tutor didn't answer",
    body: "Your session is saved, with your last sentence.",
    action: "Try again",
  },
  disconnected: { title: "Lost the connection", body: "Your session is saved.", action: "Reconnect" },
  in_use: { title: "This session is open in another tab", body: "Close the other tab, then try again.", action: "Try again" },
  not_found: { title: "This session can't continue", body: "Start a new one from Today.", action: "Try again" },
  ended: { title: "This session has ended", body: "Start a new one from Today.", action: "Try again" },
  server: { title: "Something went wrong", body: "Your session is saved up to your last sentence.", action: "Try again" },
  bad_audio: { title: "Didn't catch that", body: "Try saying it again.", action: "Try again" },
  busy: { title: "Still answering", body: "Wait for the tutor, then speak.", action: "Try again" },
  conflict: { title: "Didn't catch that", body: "Try saying it again.", action: "Try again" },
  invalid: { title: "Something went wrong", body: "Try again.", action: "Try again" },
  too_long: { title: "That turn was too long", body: "Keep each turn under a minute.", action: "Try again" },
};

const MIC_STEPS_PT = [
  "Clique no cadeado ao lado do endereço.",
  "Em Microfone, escolha Permitir.",
  "Volte aqui e toque em Tentar de novo.",
];

const FAILURE_PT: Record<FailureCode, FailureCopy> = {
  mic_blocked: { title: "O Voxa não consegue ouvir você", body: "O navegador está bloqueando o microfone.", action: "Tentar de novo", steps: MIC_STEPS_PT },
  mic_busy: {
    title: "O microfone está ocupado",
    body: "Outro app pode estar usando o microfone. Feche esse app ou escolha outro microfone e tente de novo.",
    action: "Tentar de novo",
  },
  mic_missing: { title: "Nenhum microfone encontrado", body: "Conecte um microfone ou um fone com microfone e tente de novo.", action: "Tentar de novo" },
  mic_unsupported: { title: "Este navegador não grava áudio", body: "Abra o Voxa em uma versão recente do Chrome, Edge ou Safari.", action: "Tentar de novo" },
  start_failed: {
    title: "A sessão não começou",
    body: "Veja se o Voxa está rodando no seu PC:",
    command: "docker compose up",
    action: "Tentar de novo",
  },
  tutor_start_failed: {
    title: "O tutor não respondeu",
    body: "Confira a chave da API do Claude no .env e os créditos da conta. O motivo está no log da API:",
    command: "docker compose logs api",
    action: "Tentar de novo",
  },
  voice_unavailable: {
    title: "O servidor de voz não está rodando",
    body: "O reconhecimento de fala e a voz do tutor rodam no seu PC. Inicie lá:",
    command: "docker compose up voice",
    action: "Verificar de novo",
  },
  tutor_unavailable: {
    title: "O tutor não respondeu",
    body: "Sua sessão está salva, com a sua última frase.",
    action: "Tentar de novo",
  },
  disconnected: { title: "A conexão caiu", body: "Sua sessão está salva.", action: "Reconectar" },
  in_use: { title: "Esta sessão está aberta em outra aba", body: "Feche a outra aba e tente de novo.", action: "Tentar de novo" },
  not_found: { title: "Esta sessão não pode continuar", body: "Comece uma nova em Hoje.", action: "Tentar de novo" },
  ended: { title: "Esta sessão terminou", body: "Comece uma nova em Hoje.", action: "Tentar de novo" },
  server: { title: "Algo deu errado", body: "Sua sessão está salva até a sua última frase.", action: "Tentar de novo" },
  bad_audio: { title: "Não deu para entender", body: "Tente dizer de novo.", action: "Tentar de novo" },
  busy: { title: "Ainda respondendo", body: "Espere o tutor terminar e depois fale.", action: "Tentar de novo" },
  conflict: { title: "Não deu para entender", body: "Tente dizer de novo.", action: "Tentar de novo" },
  invalid: { title: "Algo deu errado", body: "Tente de novo.", action: "Tentar de novo" },
  too_long: { title: "Essa fala ficou longa demais", body: "Fale menos de um minuto por vez.", action: "Tentar de novo" },
};

export const SESSION_COPY: Copy<SessionCopy> = {
  en: {
    stage: {
      waiting: "Waiting for Voxa",
      paused: "Paused",
      nice: "Nice",
      speaking: "Speaking",
      sayOnce: "Say it once so it sticks",
      hintFirst: "Hint · say it again",
      hintSecond: "Hint · one more try",
      listening: "Listening",
      listeningHint: "Pause to send · tap to send now",
      yourTurn: "Your turn",
      missed: "Didn't catch that. Too quiet, or too much noise around you.",
      justTalk: "Just talk. Stuck on a word? Say it in Portuguese.",
      thinking: "Thinking",
    },
    failure: FAILURE_EN,
    page: {
      saving: "Saving your session",
      pause: "Pause",
      showTranscript: "Show transcript",
      hideTranscript: "Hide transcript",
      transcript: "Transcript",
      sendNow: "Send now",
      stopTutor: "Stop the tutor",
      tapToHear: "Tap anywhere to hear Voxa.",
      ballTip: "Tip: tap the ball to send what you said, or to stop Voxa talking.",
      yourAnswer: "Your answer",
      send: "Send",
      typeInstead: "Type instead",
      endSession: "End session",
      backToToday: "Back to Today",
      paused: "Paused",
      resume: "Resume",
      repeatLast: "Repeat the last question",
      keptAnswer: "Your answer is kept: no need to say it again.",
      retrying: (attempt, of) => `Trying again by itself (${attempt} of ${of})…`,
      turnLimit: (max) => `At ${max} Voxa sends what you said so far. Then you can go on.`,
    },
    parts: {
      tutor: "Tutor",
      you: "You",
      showTutorLine: "Show what the tutor said",
      hideTutorLine: "Hide what the tutor said",
      youSaid: "Say it again, fixing these words",
      hint: "Hint",
      hintOf: (step) => `Hint ${step} of 2`,
      correctForm: "The correct form",
      savedToBank: "Saved to your mistake bank",
      help: "Help",
    },
  },
  "pt-BR": {
    stage: {
      waiting: "Esperando o Voxa",
      paused: "Sessão pausada",
      nice: "Boa",
      speaking: "Falando",
      sayOnce: "Diga uma vez para fixar",
      hintFirst: "Dica · diga de novo",
      hintSecond: "Dica · mais uma tentativa",
      listening: "Ouvindo",
      listeningHint: "Faça uma pausa para enviar · toque para enviar agora",
      yourTurn: "Sua vez",
      missed: "Não deu para ouvir. Pode ter ficado baixo ou com barulho em volta.",
      justTalk: "É só falar. Travou numa palavra? Diga em português.",
      thinking: "Pensando",
    },
    failure: FAILURE_PT,
    page: {
      saving: "Salvando sua sessão",
      pause: "Pausar",
      showTranscript: "Mostrar a conversa",
      hideTranscript: "Esconder a conversa",
      transcript: "Conversa",
      sendNow: "Enviar agora",
      stopTutor: "Parar o tutor",
      tapToHear: "Toque em qualquer lugar para ouvir o Voxa.",
      ballTip: "Dica: toque na bolinha para enviar o que você disse ou para interromper o Voxa.",
      yourAnswer: "Sua resposta",
      send: "Enviar",
      typeInstead: "Digitar em vez de falar",
      endSession: "Encerrar sessão",
      backToToday: "Voltar para Hoje",
      paused: "Sessão pausada",
      resume: "Continuar",
      repeatLast: "Repetir a última pergunta",
      keptAnswer: "Sua resposta está guardada: não precisa falar de novo.",
      retrying: (attempt, of) => `Tentando de novo sozinho (${attempt} de ${of})…`,
      turnLimit: (max) => `Em ${max} o Voxa envia o que você disse até aqui. Depois você continua.`,
    },
    parts: {
      tutor: "Tutor",
      you: "Você",
      showTutorLine: "Ver o que o tutor disse",
      hideTutorLine: "Esconder o que o tutor disse",
      youSaid: "Diga de novo, ajustando este trecho",
      hint: "Dica",
      hintOf: (step) => `Dica ${step} de 2`,
      correctForm: "A forma correta",
      savedToBank: "Salvo no seu banco de erros",
      help: "Ajuda",
    },
  },
};

/** Failures where trying again cannot help: only leaving makes sense. */
export const FINAL_FAILURES: FailureCode[] = ["not_found", "ended"];
