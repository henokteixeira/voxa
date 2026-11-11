import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MicrophoneHandlers, openMicrophone } from "./microphone";

/** A fake microphone stream: one track that records whether it was stopped. */
function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

let streams: ReturnType<typeof fakeStream>[];
let getUserMedia: ReturnType<typeof vi.fn>;
let sources: { disconnect: ReturnType<typeof vi.fn>; stream: MediaStream }[];

class FakeAudioContext {
  sampleRate = 16000;
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
  createMediaStreamSource(stream: MediaStream) {
    const source = { stream, connect: vi.fn((node: unknown) => node), disconnect: vi.fn() };
    sources.push(source);
    return source;
  }
  createGain() {
    return { gain: { value: 1 }, connect: vi.fn((node: unknown) => node) };
  }
}

let tap: FakeWorkletNode;
class FakeWorkletNode {
  constructor() {
    tap = this;
  }
  port = { onmessage: null as ((event: MessageEvent) => void) | null };
  connect = vi.fn((node: unknown) => node);
}

const handlers: MicrophoneHandlers = { onSpeechStart: vi.fn(), onTurn: vi.fn() };
/** Released while paused, and the room's noise counts as learned from the start. */
const releasing = { releaseWhilePaused: true, calibrationMs: 0 };

/** One 20 ms frame of quiet room noise from the worklet. */
function hear() {
  tap.port.onmessage?.({ data: new Float32Array(320).fill(0.001) } as MessageEvent);
}

beforeEach(() => {
  streams = [];
  sources = [];
  getUserMedia = vi.fn(async () => {
    const made = fakeStream();
    streams.push(made);
    return made.stream;
  });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:tap", revokeObjectURL: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("openMicrophone", () => {
  // iOS lowers the speaker while a page holds the microphone: the tutor would sound faint.
  it("lets go of the microphone while paused", async () => {
    const mic = await openMicrophone(handlers, releasing);
    mic.pause();
    expect(streams[0].track.stop).toHaveBeenCalled();
    expect(sources[0].disconnect).toHaveBeenCalled();
  });

  it("keeps the microphone while paused unless asked to let go", async () => {
    const mic = await openMicrophone(handlers, { calibrationMs: 0 });
    mic.pause();
    hear();
    expect(streams[0].track.stop).not.toHaveBeenCalled();
  });

  it("lets go only once the room's noise is learned", async () => {
    const mic = await openMicrophone(handlers, { releaseWhilePaused: true, calibrationMs: 40 });
    mic.pause();
    hear();
    expect(streams[0].track.stop).not.toHaveBeenCalled();
    hear();
    expect(streams[0].track.stop).toHaveBeenCalled();
  });

  it("says it listens at once when the microphone is still open", async () => {
    const onListening = vi.fn();
    const mic = await openMicrophone({ ...handlers, onListening }, { calibrationMs: 0 });
    mic.pause();
    mic.resume();
    expect(onListening).toHaveBeenCalledTimes(1);
  });

  it("opens the microphone again on resume, and says when it listens", async () => {
    const onListening = vi.fn();
    const mic = await openMicrophone({ ...handlers, onListening }, releasing);
    mic.pause();
    mic.resume();
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(sources[1].stream).toBe(streams[1].stream);
    expect(streams[1].track.stop).not.toHaveBeenCalled();
    expect(onListening).toHaveBeenCalledTimes(1);
  });

  it("does not open it again when already listening", async () => {
    const mic = await openMicrophone(handlers, releasing);
    mic.resume();
    await Promise.resolve();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("lets go of a microphone that opens after a pause came in", async () => {
    const mic = await openMicrophone(handlers, releasing);
    mic.pause();
    mic.resume();
    mic.pause();
    await vi.waitFor(() => expect(streams).toHaveLength(2));
    await vi.waitFor(() => expect(streams[1].track.stop).toHaveBeenCalled());
  });

  it("lets go of a microphone that opens after it was stopped", async () => {
    const mic = await openMicrophone(handlers, releasing);
    mic.pause();
    mic.resume();
    mic.stop();
    await vi.waitFor(() => expect(streams).toHaveLength(2));
    await vi.waitFor(() => expect(streams[1].track.stop).toHaveBeenCalled());
  });

  it("says so when the microphone can't be opened again", async () => {
    const onUnavailable = vi.fn();
    const mic = await openMicrophone({ ...handlers, onUnavailable }, releasing);
    mic.pause();
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    mic.resume();
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledWith("blocked"));
  });
});
