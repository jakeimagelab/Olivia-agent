"use client";

import { useState } from "react";
import VoiceInterviewHub from "@/components/voice/VoiceInterviewHub";
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
          <VoiceInterviewHub embedded mobileShell onOpenResult={setRecordingId} />
        )}
      </div>
    </section>
  );
}
