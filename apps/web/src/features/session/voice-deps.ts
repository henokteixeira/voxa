import { createContext } from "react";
import { createClipPlayer } from "@/lib/voice/clip-player";
import { openMicrophone } from "@/lib/voice/microphone";
import { createSpeaker } from "@/lib/voice/speaker";
import { openVoiceSocket } from "@/lib/voice/voice-socket";

/** The browser pieces of a live session, swappable so tests can drive the screen. */
export interface VoiceDeps {
  openMicrophone: typeof openMicrophone;
  openVoiceSocket: typeof openVoiceSocket;
  createSpeaker: typeof createSpeaker;
  createClipPlayer: typeof createClipPlayer;
}

export const VoiceDepsContext = createContext<VoiceDeps>({ openMicrophone, openVoiceSocket, createSpeaker, createClipPlayer });
