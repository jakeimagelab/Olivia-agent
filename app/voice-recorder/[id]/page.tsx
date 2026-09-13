import type { Metadata } from "next";
import VoiceRecordingDetail from "@/components/voice/VoiceRecordingDetail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "음성 기록 | Olivia" };

export default async function VoiceRecordingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VoiceRecordingDetail id={id} />;
}
