import { createContext } from "react";
import { openMicrophone } from "@/lib/voice/microphone";
import { createSpeaker } from "@/lib/voice/speaker";
import { openVoiceSocket } from "@/lib/voice/voice-socket";

/** The browser pieces of a live session, swappable so tests can drive the screen. */
export interface VoiceDeps {
  openMicrophone: typeof openMicrophone;
  openVoiceSocket: typeof openVoiceSocket;
  createSpeaker: typeof createSpeaker;
}

export const VoiceDepsContext = createContext<VoiceDeps>({ openMicrophone, openVoiceSocket, createSpeaker });
