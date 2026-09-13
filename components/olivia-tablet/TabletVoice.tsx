"use client";

import { AppIcon } from "@/components/AppIcon";
import styles from "./OliviaTabletShell.module.css";

export default function TabletVoice() {
  return (
    <section className={styles.disabledScreen} aria-label="AI 음성 준비 중">
      <span className={styles.disabledIcon}><AppIcon name="prompter" size={58} /></span>
      <p>COMING SOON</p>
      <h2>AI 음성 기능은 준비 중입니다.</h2>
      <span>이번 Tablet V1에는 녹음·전사·API 기능을 연결하지 않았습니다.</span>
    </section>
  );
}
