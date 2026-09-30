import type { Metadata } from "next";
import VoiceRecordingHistory from "@/components/voice/VoiceRecordingHistory";
import VoiceInterviewHub from "@/components/voice/VoiceInterviewHub";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "음성 기록 | Olivia" };

export default function VoiceRecorderPage() {
  return (
    <>
      <VoiceInterviewHub />
      <VoiceRecordingHistory />
    </>
  );
}
