/** Browsers keep audio suspended until the page has had a tap; don't wait for it forever. */
const RESUME_TIMEOUT_MS = 1500;

export class AudioBlockedError extends Error {
  constructor() {
    super("The browser blocked audio playback.");
    this.name = "AudioBlockedError";
  }
}

/** Plays the tutor's speech (WAV). Browser glue, checked by hand on the PC. */
export interface Speaker {
  /** Resolves when playback ends or is stopped; rejects with AudioBlockedError until the page gets a tap. */
  play(wav: ArrayBuffer): Promise<void>;
  /** Stops what is playing, or what is about to play. */
  stop(): void;
  /** Call from a tap or click: lets the browser play audio. */
  unlock(): void;
  close(): void;
}

export function createSpeaker(): Speaker {
  const context = new AudioContext();
  let closed = false;
  // Bumped by stop(): a play() that started before it never makes a sound.
  let generation = 0;
  let current: { source: AudioBufferSourceNode; done: () => void } | null = null;

  const stop = () => {
    generation++;
    if (!current) return;
    const { source, done } = current;
    current = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    done();
  };

  return {
    async play(wav) {
      stop();
      const mine = generation;
      await Promise.race([context.resume(), new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS))]);
      if (mine !== generation || closed) return;
      if (context.state !== "running") throw new AudioBlockedError();
      const buffer = await context.decodeAudioData(wav.slice(0));
      if (mine !== generation || closed) return;
      await new Promise<void>((resolve) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        current = { source, done: resolve };
        source.onended = () => {
          current = null;
          resolve();
        };
        source.start();
      });
    },
    stop,
    unlock() {
      if (!closed) context.resume().catch(() => {});
    },
    close() {
      if (closed) return;
      stop();
      closed = true;
      context.close().catch(() => {});
    },
  };
}
