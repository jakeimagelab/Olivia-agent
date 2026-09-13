import type { Metadata } from "next";
import OliviaRecorder from "@/components/voice/OliviaRecorder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "음성 기록 | Olivia" };

export default function VoiceRecorderPage() {
  return <OliviaRecorder />;
}
