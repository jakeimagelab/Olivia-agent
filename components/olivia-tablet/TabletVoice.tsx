"use client";

import OliviaRecorder from "@/components/voice/OliviaRecorder";
import VoiceRecordingHistory from "@/components/voice/VoiceRecordingHistory";

export default function TabletVoice() {
  return (
    <>
      <OliviaRecorder embedded />
      <VoiceRecordingHistory />
    </>
  );
}
