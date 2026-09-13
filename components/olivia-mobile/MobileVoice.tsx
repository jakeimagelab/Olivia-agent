"use client";

import { useState } from "react";
import OliviaRecorder from "@/components/voice/OliviaRecorder";
import VoiceRecordingDetail from "@/components/voice/VoiceRecordingDetail";
import MobileHeader from "./MobileHeader";
import styles from "./OliviaMobileShell.module.css";

export default function MobileVoice({ onBack }: { onBack: () => void }) {
  const [recordingId, setRecordingId] = useState<string | null>(null);

  return (
    <section className={styles.screenWithHeader} aria-label="모바일 음성 기록">
      <MobileHeader
        title="음성 기록"
        subtitle={recordingId ? "화자별 대화와 정리 결과를 확인하세요." : "대화를 녹음하면 Olivia가 자동으로 정리해요."}
        onBack={recordingId ? () => setRecordingId(null) : onBack}
      />
      <div className={styles.mobileVoiceBody}>
        {recordingId ? (
          <VoiceRecordingDetail id={recordingId} embedded />
        ) : (
          <OliviaRecorder embedded mobileShell onOpenResult={setRecordingId} />
        )}
      </div>
    </section>
  );
}
