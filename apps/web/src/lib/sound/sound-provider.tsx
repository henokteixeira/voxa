import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createSoundPlayer, type SoundPlayer } from "./sound-player";
import { readSoundsEnabled, saveSoundsEnabled } from "./sound-setting";
import { SoundContext, type Sounds } from "./sounds";

export function SoundProvider({ children, player: given }: { children: ReactNode; player?: SoundPlayer }) {
  const [enabled, setEnabledState] = useState(readSoundsEnabled);
  const [player] = useState(() => given ?? createSoundPlayer({ enabled }));
  // Browsers keep audio suspended until the page gets a tap: any tap anywhere unlocks it.
  useEffect(() => {
    const unlock = () => player.unlock();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, [player]);
  const value = useMemo<Sounds>(
    () => ({
      play: (cue) => player.play(cue),
      player,
      enabled,
      setEnabled: (next) => {
        setEnabledState(next);
        saveSoundsEnabled(next);
        player.setEnabled(next);
        // Turning sounds on answers with one, so the learner hears what they chose.
        if (next) player.play("tap");
      },
    }),
    [player, enabled],
  );
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}
