import { TurnDetector, type TurnDetectorOptions } from "./turn-detector";
import { TurnRecorder } from "./turn-recorder";

/**
 * Browser glue: microphone → 20 ms frames → TurnRecorder. The logic lives in TurnRecorder
 * (unit-tested); this file only talks to Web Audio and is checked by hand on the PC.
 */
export interface MicrophoneHandlers {
  /** The learner started talking. */
  onSpeechStart(): void;
  /** A finished turn, as 16 kHz WAV. */
  onTurn(wav: ArrayBuffer): void;
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
  /** Stop making turns (while the tutor thinks or speaks). The room's noise is still learned. */
  pause(): void;
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
  options: Partial<TurnDetectorOptions> = {},
): Promise<Microphone> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
    throw new MicrophoneUnavailableError("unsupported");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (error) {
    throw new MicrophoneUnavailableError(reasonFor(error));
  }

  const context = new AudioContext();
  const release = () => {
    for (const track of stream.getTracks()) track.stop();
    context.close().catch(() => {});
  };
  let source: MediaStreamAudioSourceNode;
  let tap: AudioWorkletNode;
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    source = context.createMediaStreamSource(stream);
    tap = new AudioWorkletNode(context, "frame-tap");
    // Some engines only run a node whose output reaches the speakers; a silent gain keeps it quiet.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(tap).connect(mute).connect(context.destination);
  } catch {
    release();
    throw new MicrophoneUnavailableError("unsupported");
  }

  const recorder = new TurnRecorder(new TurnDetector(options), context.sampleRate);
  let paused = false;
  let stopped = false;
  tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (paused) {
      recorder.learn(event.data);
      return;
    }
    const result = recorder.push(event.data);
    if (result?.type === "start") handlers.onSpeechStart();
    else if (result?.type === "turn") handlers.onTurn(result.wav);
  };

  return {
    pause: () => {
      paused = true;
      recorder.discard();
    },
    resume: () => {
      if (stopped) return;
      recorder.discard();
      paused = false;
      context.resume().catch(() => {});
    },
    sendNow: () => {
      const wav = recorder.flush();
      if (wav) handlers.onTurn(wav);
      return wav !== null;
    },
    unlock: () => {
      if (!stopped) context.resume().catch(() => {});
    },
    stop: () => {
      if (stopped) return;
      stopped = paused = true;
      tap.port.onmessage = null;
      source.disconnect();
      release();
    },
  };
}
