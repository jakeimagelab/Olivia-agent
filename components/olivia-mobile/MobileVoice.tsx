"use client";

import { useState } from "react";
import OliviaRecorder from "@/components/voice/OliviaRecorder";
import VoiceRecordingDetail from "@/components/voice/VoiceRecordingDetail";
import styles from "./OliviaMobileShell.module.css";

export default function MobileVoice() {
  const [recordingId, setRecordingId] = useState<string | null>(null);

  return (
    <section className={styles.screenWithHeader} aria-label="모바일 음성 기록">
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
