import { TurnDetector } from "./turn-detector";
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

export type MicrophoneError = "blocked" | "missing" | "unsupported";

export class MicrophoneUnavailableError extends Error {
  readonly reason: MicrophoneError;

  constructor(reason: MicrophoneError) {
    super(`Microphone ${reason}`);
    this.reason = reason;
    this.name = "MicrophoneUnavailableError";
  }
}

export interface Microphone {
  /** Stop turning sound into turns (while the tutor thinks or speaks). Frames are dropped. */
  pause(): void;
  resume(): void;
  /** Send what was said so far as a turn (tap to send). Returns false when nobody was talking. */
  sendNow(): boolean;
  stop(): void;
}

// Posts 20 ms frames of mono samples to the main thread.
const WORKLET = `
class FrameTap extends AudioWorkletProcessor {
  constructor() { super(); this.size = Math.round(sampleRate / 50); this.buf = new Float32Array(this.size); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.size) { this.port.postMessage(this.buf.slice()); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("frame-tap", FrameTap);
`;

export async function openMicrophone(handlers: MicrophoneHandlers): Promise<Microphone> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
    throw new MicrophoneUnavailableError("unsupported");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (error) {
    const name = (error as DOMException).name;
    throw new MicrophoneUnavailableError(name === "NotFoundError" ? "missing" : "blocked");
  }

  const context = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const source = context.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(context, "frame-tap");
  source.connect(tap);

  const recorder = new TurnRecorder(new TurnDetector(), context.sampleRate);
  let paused = false;
  tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (paused) return;
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
      recorder.discard();
      paused = false;
      void context.resume();
    },
    sendNow: () => {
      const wav = recorder.flush();
      if (wav) handlers.onTurn(wav);
      return wav !== null;
    },
    stop: () => {
      paused = true;
      tap.port.onmessage = null;
      source.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void context.close();
    },
  };
}
