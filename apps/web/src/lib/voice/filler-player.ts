import type { Speaker } from "./speaker";

/** Waits shorter than this need no filler: the answer is about to come. */
export const FILLER_DELAY_MS = 1000;

export interface FillerPlayer {
  /** The lines to pick from (WAV); none until they load. */
  setClips(clips: ArrayBuffer[]): void;
  /** The learner finished a spoken turn: say a filler line on `speaker` if the answer takes longer than the delay. */
  arm(speaker: Speaker | null): void;
  /** The turn held speech (its transcript came). Until then nothing plays: a turn with no speech gets no "Got it.". */
  heard(): void;
  /** The answer (or an error, or a pause) came: forget the timer and cut a line that is playing. */
  cancel(): void;
}

/**
 * Plays a short pre-recorded line ("Okay, give me a second.") while the tutor prepares an answer.
 * Never the same line twice in a row. Best effort: no clips (not loaded yet, or failed) means silence.
 */
export function createFillerPlayer({
  delayMs = FILLER_DELAY_MS, random = Math.random }: { delayMs?: number; random?: () => number } = {}): FillerPlayer {
  let clips: ArrayBuffer[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** The armed turn: its speaker, whether the delay has passed and whether speech was heard. */
  let turn: { speaker: Speaker | null; late: boolean; heard: boolean } | null = null;
  /** The speaker a line is playing on, until it ends. */
  let playing: Speaker | null = null;
  let last = -1;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const pick = (count: number) => {
    if (count === 1) return 0;
    // Pick among the others: skip the last one played.
    let index = Math.floor(random() * (count - 1));
    if (index >= last && last >= 0) index++;
    return index;
  };

  return {
    setClips(next) {
      clips = next;
    },
    arm(speaker) {
      clearTimer();
      turn = { speaker, late: false, heard: false };
      timer = setTimeout(() => {
        timer = null;
        if (turn) turn.late = true;
        playIfDue();
      }, delayMs);
    },
    heard() {
      if (turn) turn.heard = true;
      playIfDue();
    },
    cancel() {
      clearTimer();
      turn = null;
      const speaker = playing;
      playing = null;
      speaker?.stop();
    },
  };

  function playIfDue() {
    if (!turn?.late || !turn.heard) return;
    const { speaker } = turn;
    turn = null;
    if (clips.length === 0 || !speaker) return;
    last = pick(clips.length);
    playing = speaker;
    // A blocked browser just stays quiet: the filler is not worth asking for a tap.
    void speaker
      .play(clips[last])
      .catch(() => {})
      .finally(() => {
        if (playing === speaker) playing = null;
      });
  }
}
