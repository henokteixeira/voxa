/** Plays the tutor's speech (WAV). Browser glue, checked by hand on the PC. */
export interface Speaker {
  /** Resolves when playback ends or is stopped. */
  play(wav: ArrayBuffer): Promise<void>;
  stop(): void;
  close(): void;
}

export function createSpeaker(): Speaker {
  const context = new AudioContext();
  let current: { source: AudioBufferSourceNode; done: () => void } | null = null;

  const stop = () => {
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
      await context.resume();
      const buffer = await context.decodeAudioData(wav.slice(0));
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
    close() {
      stop();
      void context.close();
    },
  };
}
