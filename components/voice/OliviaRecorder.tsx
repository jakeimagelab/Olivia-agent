"use client";

import { AlertCircle, CheckCircle2, FileAudio, Mic, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useVoiceSession } from "./VoiceSessionProvider";
import styles from "./OliviaRecorder.module.css";

export default function OliviaRecorder({
  embedded = false,
  mobileShell = false,
  tabletShell = false,
  onOpenResult,
}: {
  embedded?: boolean;
  mobileShell?: boolean;
  tabletShell?: boolean;
  onOpenResult?: (id: string) => void;
}) {
  const { state, prepareGeneral, retryStorage } = useVoiceSession();

  useEffect(() => { prepareGeneral(); }, [prepareGeneral]);
  useEffect(() => {
    if (state.storage === "stored" && state.resultId) onOpenResult?.(state.resultId);
  }, [onOpenResult, state.resultId, state.storage]);

  const importing = ["starting", "stopping"].includes(state.capture) || ["local", "uploading"].includes(state.storage);
  return (
    <section className={`${styles.recorder} ${embedded ? styles.embedded : ""} ${mobileShell ? styles.mobileShell : ""} ${tabletShell ? styles.tabletEmbedded : ""}`} aria-label="일반 음성기록">
      <header className={styles.header}>
        <span className={styles.icon}><Mic size={23} /></span>
        <div><p>OLIVIA VOICE</p><h2>아이폰 음성 원본을 정리해보세요</h2><span>아이폰 음성 메모 원본을 그대로 올리면 Olivia가 전사와 AI 정리를 진행합니다.</span></div>
      </header>
      <section className={styles.statusCard} data-recording-state={state.capture}>
        <div className={styles.importIcon} aria-hidden="true"><FileAudio size={30} /></div>
        <div>
          <strong>{importing ? "아이폰 원본을 업로드하고 있습니다" : state.storage === "stored" ? "아이폰 원본이 저장되었습니다" : "하단에서 아이폰 파일을 선택해주세요"}</strong>
          <p>{importing ? "원본은 변환하거나 재압축하지 않습니다." : "이 화면은 마이크 권한을 요청하거나 브라우저에서 녹음하지 않습니다."}</p>
        </div>
      </section>
      <section className={styles.infoGrid}>
        <article><FileAudio size={18} /><div><strong>아이폰 원본 그대로</strong><span>Olivia는 업로드 파일을 변환하거나 재압축하지 않습니다.</span></div></article>
        <article><ShieldCheck size={18} /><div><strong>원본과 AI 결과 분리</strong><span>AI 분석에 실패해도 저장된 원본 파일은 유지됩니다.</span></div></article>
      </section>
      {state.storage === "partial" || state.storage === "failed" ? <div className={styles.warning}><AlertCircle size={18} /><div><strong>기기에 저장한 녹음 구간이 있습니다.</strong><span>{state.notice || "네트워크가 연결되면 업로드를 다시 시도할 수 있습니다."}</span></div><button type="button" onClick={() => void retryStorage()}>다시 시도</button></div> : null}
      {state.storage === "stored" ? <div className={styles.complete}><CheckCircle2 size={18} /><span>저장 완료{state.analysis === "completed" ? " · AI 정리 완료" : " · AI 정리 진행 상태는 하단에서 확인할 수 있습니다."}</span></div> : null}
    </section>
  );
}
