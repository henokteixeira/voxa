import { AudioBlockedError, RESUME_TIMEOUT_MS } from "./speaker";

/** Plays one recorded clip (WAV) the learner can pause and resume. Browser glue, checked by hand on the PC. */
export interface ClipPlayer {
  /** Decodes the clip; playback starts at its beginning. */
  load(wav: ArrayBuffer): Promise<void>;
  /**
   * Plays from where it stopped. Resolves true once it plays, false when pause() or close() came first;
   * rejects with AudioBlockedError until the page gets a tap.
   */
  play(): Promise<boolean>;
  /** Stops where it is: the next play() goes on from there. */
  pause(): void;
  /** Call from a tap or click: lets the browser play audio. */
  unlock(): void;
  close(): void;
}

/** `onEnded` runs when the clip plays to its end; the next play() starts it over. */
export function createClipPlayer(onEnded: () => void): ClipPlayer {
  const context = new AudioContext();
  let closed = false;
  let buffer: AudioBuffer | null = null;
  let source: AudioBufferSourceNode | null = null;
  // Where the current or next run starts in the clip, and the context time the current run started.
  let offset = 0;
  let startedAt = 0;
  // Bumped by pause(): a play() still waiting for the browser never starts.
  let generation = 0;

  const halt = () => {
    if (!source || !buffer) return;
    offset = Math.min(offset + context.currentTime - startedAt, buffer.duration);
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    source = null;
  };

  const start = () => {
    if (!buffer || closed) return;
    const run = context.createBufferSource();
    run.buffer = buffer;
    run.connect(context.destination);
    run.onended = () => {
      source = null;
      offset = 0;
      onEnded();
    };
    startedAt = context.currentTime;
    run.start(0, offset);
    source = run;
  };

  return {
    async load(wav) {
      halt();
      offset = 0;
      buffer = await context.decodeAudioData(wav.slice(0));
    },
    async play() {
      if (source) return true;
      if (!buffer || closed) return false;
      const mine = generation;
      await Promise.race([context.resume(), new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS))]);
      if (mine !== generation || closed) return false;
      if (source) return true;
      if (context.state !== "running") throw new AudioBlockedError();
      start();
      return true;
    },
    pause() {
      generation++;
      halt();
    },
    unlock() {
      if (!closed) context.resume().catch(() => {});
    },
    close() {
      if (closed) return;
      generation++;
      halt();
      closed = true;
      context.close().catch(() => {});
    },
  };
}
