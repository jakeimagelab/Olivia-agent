"use client";

import VoiceRecordingHistory from "@/components/voice/VoiceRecordingHistory";
import VoiceInterviewHub from "@/components/voice/VoiceInterviewHub";
import styles from "./OliviaTabletShell.module.css";

export default function TabletVoice() {
  return (
    <section className={styles.tabletVoicePage}>
      <VoiceInterviewHub embedded tabletShell />
      <VoiceRecordingHistory />
    </section>
  );
}
