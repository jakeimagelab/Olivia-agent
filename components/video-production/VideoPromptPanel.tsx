"use client";

import { MessageSquareText } from "lucide-react";
import styles from "./VideoProductionWorkspace.module.css";

export function VideoPromptPanel({ value, onChange, required }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <section className={styles.formSection}>
      <div className={styles.sectionKicker}><MessageSquareText size={15} /> 프롬프트 {required ? <b>필수</b> : null}</div>
      <textarea className={styles.prompt} value={value} maxLength={4_000} onChange={(event) => onChange(event.target.value)} placeholder="카메라가 천천히 앞으로 이동하면서 병원의 깨끗한 공간을 자연스럽게 보여준다." />
      <div className={styles.inputFoot}><span>Olivia AI 프롬프트 만들기는 다음 단계에서 연결할 수 있습니다.</span><strong>{value.length}/4000</strong></div>
    </section>
  );
}
