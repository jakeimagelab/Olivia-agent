import type { Metadata } from "next";
import VoiceRecorderStandalone from "@/components/voice/VoiceRecorderStandalone";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "음성 기록 | Olivia" };

export default function VoiceRecorderPage() {
  return <VoiceRecorderStandalone />;
}
