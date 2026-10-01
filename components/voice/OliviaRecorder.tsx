"use client";

import { AlertCircle, CheckCircle2, Mic, ShieldCheck, Volume2 } from "lucide-react";
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

  const quality = state.quality;
  const inProgress = ["starting", "recording", "paused", "stopping"].includes(state.capture);
  return (
    <section className={`${styles.recorder} ${embedded ? styles.embedded : ""} ${mobileShell ? styles.mobileShell : ""} ${tabletShell ? styles.tabletEmbedded : ""}`} aria-label="일반 음성기록">
      <header className={styles.header}>
        <span className={styles.icon}><Mic size={23} /></span>
        <div><p>OLIVIA VOICE</p><h2>지금 대화를 기록해보세요</h2><span>녹음 시작과 종료는 모든 화면에서 보이는 하단 녹음바에서 관리합니다.</span></div>
      </header>
      <section className={styles.statusCard} data-recording-state={state.capture}>
        <div className={styles.waveform} aria-hidden="true">{state.waveform.map((value, index) => <i key={index} style={{ height: `${Math.max(8, Math.round(value * 52))}px` }} />)}</div>
        <div>
          <strong>{inProgress ? state.capture === "paused" ? "일시정지됨" : "마이크 입력을 기록 중입니다" : state.storage === "stored" ? "원본 음성이 저장되었습니다" : "하단의 녹음 시작을 눌러주세요"}</strong>
          <p>{inProgress ? "화면을 이동해도 동일한 녹음 세션과 타이머가 유지됩니다." : "시작 전에는 마이크 권한을 요청하지 않습니다."}</p>
        </div>
      </section>
      <section className={styles.infoGrid}>
        <article><Volume2 size={18} /><div><strong>음성 원본 보존</strong><span>AI 처리 결과와 별도로 원본을 저장합니다.</span></div></article>
        <article><ShieldCheck size={18} /><div><strong>요청값 48kHz · 모노 · 128kbps</strong><span>{quality ? `실제 입력: ${quality.actualSampleRate ? `${quality.actualSampleRate / 1000}kHz` : "브라우저 확인 중"} · ${quality.mimeType || "지원 MIME"}` : "브라우저가 지원하는 설정으로 녹음합니다."}</span></div></article>
      </section>
      {state.storage === "partial" || state.storage === "failed" ? <div className={styles.warning}><AlertCircle size={18} /><div><strong>기기에 저장한 녹음 구간이 있습니다.</strong><span>{state.notice || "네트워크가 연결되면 업로드를 다시 시도할 수 있습니다."}</span></div><button type="button" onClick={() => void retryStorage()}>다시 시도</button></div> : null}
      {state.storage === "stored" ? <div className={styles.complete}><CheckCircle2 size={18} /><span>저장 완료{state.analysis === "completed" ? " · AI 정리 완료" : " · AI 정리 진행 상태는 하단에서 확인할 수 있습니다."}</span></div> : null}
    </section>
  );
}
