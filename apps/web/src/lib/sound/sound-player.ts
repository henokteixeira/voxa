import { CUES, type Cue } from "./cues";

/** Plays the app's cues. Never over the tutor's voice: cues wait until it ends. */
export interface SoundPlayer {
  play(cue: Cue): void;
  /** While the tutor speaks, cues wait and play right after (only the latest few). */
  setVoiceActive(active: boolean): void;
  setEnabled(enabled: boolean): void;
  /** Call from a tap: browsers keep audio suspended until the page has had one. */
  unlock(): void;
}

/** Cues kept while the tutor speaks; older ones are dropped so they never pile up. */
const MAX_WAITING = 2;
/** Main tone and a quiet overtone (4×) give the marimba colour. Kept well below the tutor's voice. */
const PARTIALS = [
  { multiple: 1, peak: 0.16, lengthShare: 1 },
  { multiple: 4, peak: 0.03, lengthShare: 0.3 },
] as const;

export function createSoundPlayer(options: {
  createContext?: () => AudioContext | null;
  enabled?: boolean;
} = {}): SoundPlayer {
  const createContext =
    options.createContext ?? (() => (typeof AudioContext === "undefined" ? null : new AudioContext()));
  let context: AudioContext | null = null;
  let enabled = options.enabled ?? true;
  let voiceActive = false;
  let waiting: Cue[] = [];

  const audio = () => {
    context ??= createContext();
    return context;
  };

  const sound = (cue: Cue) => {
    const ctx = audio();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    const start = ctx.currentTime + 0.01;
    for (const [hz, at, length] of CUES[cue]) {
      for (const { multiple, peak, lengthShare } of PARTIALS) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = start + at;
        const end = t + length * lengthShare;
        oscillator.type = "sine";
        oscillator.frequency.value = hz * multiple;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(peak, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(t);
        oscillator.stop(end + 0.03);
      }
    }
  };

  return {
    play(cue) {
      if (!enabled) return;
      if (voiceActive) {
        waiting = [...waiting, cue].slice(-MAX_WAITING);
        return;
      }
      sound(cue);
    },
    setVoiceActive(active) {
      voiceActive = active;
      if (active) return;
      const due = waiting;
      waiting = [];
      if (enabled) due.forEach(sound);
    },
    setEnabled(value) {
      enabled = value;
      if (!value) waiting = [];
    },
    unlock() {
      const ctx = audio();
      if (ctx?.state === "suspended") void ctx.resume().catch(() => undefined);
    },
  };
}
