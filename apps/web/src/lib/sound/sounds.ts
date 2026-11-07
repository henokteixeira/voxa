import { createContext, useContext } from "react";
import type { Cue } from "./cues";
import type { SoundPlayer } from "./sound-player";

export interface Sounds {
  play(cue: Cue): void;
  player: SoundPlayer;
  enabled: boolean;
  setEnabled(enabled: boolean): void;
}

const silentPlayer: SoundPlayer = { play() {}, setVoiceActive() {}, setEnabled() {}, unlock() {} };

/** Without a provider (tests, isolated components) the app plays nothing. */
export const SoundContext = createContext<Sounds>({ play() {}, player: silentPlayer, enabled: false, setEnabled() {} });

/** The app's sounds. */
export function useSounds(): Sounds {
  return useContext(SoundContext);
}
