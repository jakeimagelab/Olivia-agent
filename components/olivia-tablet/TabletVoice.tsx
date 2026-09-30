"use client";

import VoiceRecordingHistory from "@/components/voice/VoiceRecordingHistory";
import VoiceInterviewHub from "@/components/voice/VoiceInterviewHub";

export default function TabletVoice() {
  return (
    <>
      <VoiceInterviewHub embedded />
      <VoiceRecordingHistory />
    </>
  );
}
