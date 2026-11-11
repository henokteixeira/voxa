import { TurnDetector, type TurnDetectorOptions } from "./turn-detector";
import { type RecordedTurn, TurnRecorder } from "./turn-recorder";

/**
 * Browser glue: microphone → 20 ms frames → TurnRecorder. The logic lives in TurnRecorder
 * (unit-tested); this file only talks to Web Audio and is checked by hand on the PC.
 */
export interface MicrophoneHandlers {
  /** The learner started talking. */
  onSpeechStart(): void;
  /** Every frame heard while listening, for a recording of the whole stretch (not only the turns). */
  onAudio?(frame: Float32Array, sampleRate: number): void;
  /** A finished turn, as 16 kHz WAV, with the silences inside it and the silence it ended with. */
  onTurn(wav: ArrayBuffer, turn?: Pick<RecordedTurn, "pausesMs"> & Partial<Pick<RecordedTurn, "trailingSilenceMs">>): void;
  /** Frames are flowing again after resume() (at once, unless the microphone had to be opened again). */
  onListening?(): void;
  /** The microphone could not be opened again after a pause. */
  onUnavailable?(reason: MicrophoneError): void;
}

export interface MicrophoneOptions extends Partial<TurnDetectorOptions> {
  /**
   * Let go of the microphone while paused (once the room's noise is learned), and open it again on resume.
   * iOS turns the speaker down while a page holds the microphone, so the tutor would sound faint.
   */
  releaseWhilePaused?: boolean;
}

/** blocked: no permission. busy: another app holds it, or it can't be opened. */
export type MicrophoneError = "blocked" | "missing" | "busy" | "unsupported";

export class MicrophoneUnavailableError extends Error {
  readonly reason: MicrophoneError;

  constructor(reason: MicrophoneError) {
    super(`Microphone ${reason}`);
    this.reason = reason;
    this.name = "MicrophoneUnavailableError";
  }
}

export interface Microphone {
  /** Stop making turns (while the tutor thinks or speaks). See MicrophoneOptions.releaseWhilePaused. */
  pause(): void;
  /** Listens again; onListening says when frames flow. */
  resume(): void;
  /** Send what was said so far as a turn (tap to send). Returns false when nobody was talking. */
  sendNow(): boolean;
  /** Call from a tap or click: lets the browser start the audio graph. */
  unlock(): void;
  stop(): void;
}

// Posts 20 ms frames of mono samples to the main thread (the buffer is transferred, not copied).
const WORKLET = `
class FrameTap extends AudioWorkletProcessor {
  constructor() { super(); this.size = Math.round(sampleRate / 50); this.buf = new Float32Array(this.size); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.size) { this.port.postMessage(this.buf, [this.buf.buffer]); this.buf = new Float32Array(this.size); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("frame-tap", FrameTap);
`;

function reasonFor(error: unknown): MicrophoneError {
  const name = (error as DOMException | undefined)?.name;
  if (name === "NotFoundError") return "missing";
  if (name === "NotReadableError" || name === "OverconstrainedError" || name === "AbortError") return "busy";
  return "blocked";
}

export async function openMicrophone(
  handlers: MicrophoneHandlers,
  { releaseWhilePaused = false, ...options }: MicrophoneOptions = {},
): Promise<Microphone> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
    throw new MicrophoneUnavailableError("unsupported");
  }
  const capture = () =>
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  let stream: MediaStream | null;
  try {
    stream = await capture();
  } catch (error) {
    throw new MicrophoneUnavailableError(reasonFor(error));
  }

  const context = new AudioContext();
  const releaseStream = (released: MediaStream | null) => {
    for (const track of released?.getTracks() ?? []) track.stop();
  };
  let source: MediaStreamAudioSourceNode | null = null;
  let tap: AudioWorkletNode;
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    tap = new AudioWorkletNode(context, "frame-tap");
    // Some engines only run a node whose output reaches the speakers; a silent gain keeps it quiet.
    const mute = context.createGain();
    mute.gain.value = 0;
    tap.connect(mute).connect(context.destination);
    source = context.createMediaStreamSource(stream);
    source.connect(tap);
  } catch {
    releaseStream(stream);
    context.close().catch(() => {});
    throw new MicrophoneUnavailableError("unsupported");
  }

  /** Lets go of the microphone; the audio graph stays, ready for the next stream. */
  const detach = () => {
    source?.disconnect();
    source = null;
    releaseStream(stream);
    stream = null;
  };

  const recorder = new TurnRecorder(new TurnDetector(options), context.sampleRate);
  let paused = false;
  let stopped = false;
  /** Bumped by every pause, resume and stop: a stream that opens late for an older one is let go. */
  let generation = 0;
  /** Paused and the room's noise is learned: nothing more to hear until resume. */
  const releaseIfDone = () => {
    if (releaseWhilePaused && paused && stream && recorder.calibrated) detach();
  };
  tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (paused) {
      recorder.learn(event.data);
      releaseIfDone();
      return;
    }
    handlers.onAudio?.(event.data, context.sampleRate);
    const result = recorder.push(event.data);
    if (result?.type === "start") handlers.onSpeechStart();
    else if (result?.type === "turn") handlers.onTurn(result.wav, { pausesMs: result.pausesMs, trailingSilenceMs: result.trailingSilenceMs });
  };

  const reopen = async (mine: number) => {
    let opened: MediaStream | null = null;
    try {
      opened = await capture();
      if (mine !== generation || stopped) return releaseStream(opened);
      const reopened = context.createMediaStreamSource(opened);
      reopened.connect(tap);
      stream = opened;
      source = reopened;
    } catch (error) {
      releaseStream(opened);
      if (mine === generation && !stopped) handlers.onUnavailable?.(reasonFor(error));
      return;
    }
    // Capturing again may have interrupted the audio graph.
    context.resume().catch(() => {});
    handlers.onListening?.();
  };

  return {
    pause: () => {
      generation++;
      paused = true;
      recorder.discard();
      releaseIfDone();
    },
    resume: () => {
      // Already listening: keep the turn in progress.
      if (stopped || !paused) return;
      generation++;
      recorder.discard();
      paused = false;
      context.resume().catch(() => {});
      if (stream) handlers.onListening?.();
      else void reopen(generation);
    },
    sendNow: () => {
      const turn = recorder.flush();
      if (turn) handlers.onTurn(turn.wav, { pausesMs: turn.pausesMs, trailingSilenceMs: turn.trailingSilenceMs });
      return turn !== null;
    },
    unlock: () => {
      if (!stopped) context.resume().catch(() => {});
    },
    stop: () => {
      if (stopped) return;
      generation++;
      stopped = paused = true;
      tap.port.onmessage = null;
      detach();
      context.close().catch(() => {});
    },
  };
}
