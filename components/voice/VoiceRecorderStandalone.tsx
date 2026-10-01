"use client";

import VoiceInterviewHub from "./VoiceInterviewHub";
import VoiceRecordingHistory from "./VoiceRecordingHistory";
import GlobalRecordingBar from "./GlobalRecordingBar";
import { VoiceSessionProvider } from "./VoiceSessionProvider";

export default function VoiceRecorderStandalone() {
  return (
    <VoiceSessionProvider>
      <main style={{ minHeight: "100dvh", padding: "24px 20px 118px", boxSizing: "border-box" }}>
        <VoiceInterviewHub />
        <VoiceRecordingHistory />
      </main>
      <GlobalRecordingBar surface="desktop" dockVisible={false} onOpenRecording={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
    </VoiceSessionProvider>
  );
}
