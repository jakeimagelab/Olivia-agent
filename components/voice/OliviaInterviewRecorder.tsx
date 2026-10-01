"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, List, MessageSquarePlus, Pause, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { InterviewPreparation, InterviewRecoveryState } from "@/lib/voice/interview/types";
import { useVoiceSession } from "./VoiceSessionProvider";
import styles from "./OliviaInterviewRecorder.module.css";

export default function OliviaInterviewRecorder({ preparation, recovery, tabletShell = false, onClose, onComplete }: {
  preparation: InterviewPreparation;
  recovery?: InterviewRecoveryState | null;
  tabletShell?: boolean;
  onClose: () => void;
  onComplete?: (recordingId: string) => void;
}) {
  const { state, prepareInterview, setViewedQuestion, beginQuestion, addHighlight, addFieldNote, addFollowUp } = useVoiceSession();
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  // Historical recovery metadata is intentionally retained by the Hub/API. The
  // persistent runtime owns active capture recovery rather than this view.
  void recovery;
  const target = useMemo(() => preparation.current_version_id ? ({
    preparationId: preparation.id,
    versionId: preparation.current_version_id,
    hospitalName: preparation.hospital_name,
    intervieweeName: preparation.interviewee_name,
    questions: preparation.selected_questions,
  }) : null, [preparation]);

  useEffect(() => { if (target) prepareInterview(target); }, [prepareInterview, target]);
  useEffect(() => {
    if (state.storage === "stored" && state.recordingId) onComplete?.(state.recordingId);
  }, [onComplete, state.recordingId, state.storage]);

  const questions = target?.questions ?? [];
  const viewedIndex = Math.max(0, questions.findIndex((question) => question.id === state.viewedQuestionId));
  const viewed = questions[viewedIndex];
  const activeIndex = questions.findIndex((question) => question.id === state.activeQuestionId);
  const isRecording = state.capture === "recording";
  const selectPreview = (index: number) => { const question = questions[index]; if (question) setViewedQuestion(question.id); };
  const advance = (direction: -1 | 1) => selectPreview(Math.max(0, Math.min(questions.length - 1, viewedIndex + direction)));

  if (!target || !viewed) return <section className={styles.start}><p>INTERVIEW STANDBY</p><strong>준비 완료된 인터뷰 질문을 찾지 못했습니다.</strong><button type="button" onClick={onClose}>인터뷰 준비로</button></section>;
  return (
    <section className={`${styles.recorder} ${tabletShell ? styles.tabletRecorder : ""}`} aria-label="인터뷰 진행">
      <header>
        <button type="button" aria-label="인터뷰 준비로" onClick={onClose}><ArrowLeft size={18} /></button>
        <div className={styles.recorderIdentity}><strong>{target.hospitalName}</strong><span>{target.intervieweeName} · 확정 질문 {questions.length}개</span></div>
        <span className={state.capture === "paused" ? styles.paused : ""}><i />{isRecording ? "인터뷰 녹음 중" : state.capture === "paused" ? "일시정지" : "질문 미리보기"}</span>
      </header>
      <p className={styles.questionProgress}>보고 있는 질문 {viewedIndex + 1} / {questions.length}{activeIndex >= 0 ? ` · 실제 녹음 질문 ${activeIndex + 1}` : ""}</p>
      <p className={styles.section}>{viewed.sectionTitle}</p>
      <h1>{viewed.text}</h1>
      <div className={styles.waveform} aria-hidden="true">{state.waveform.map((value, index) => <i key={index} style={{ height: `${Math.max(6, value * 88)}px` }} />)}</div>
      <p className={styles.notice}>{state.capture === "paused" ? "일시정지 중에는 질문 마커를 만들지 않습니다. 하단에서 녹음을 계속한 뒤 진행해주세요." : isRecording ? "질문을 미리 보는 것만으로는 마커가 생기지 않습니다. 실제 답변을 시작할 때만 아래 버튼을 누르세요." : "하단 고정바에서 녹음을 시작하면 현재 질문에 첫 질문 마커가 연결됩니다."}</p>
      <div className={styles.questionActions}>
        <button type="button" disabled={viewedIndex === 0} onClick={() => advance(-1)}><ChevronLeft size={18} />이전 미리보기</button>
        <button type="button" className={styles.recordingControl} disabled={!isRecording} onClick={() => beginQuestion(viewed.id)}><List size={17} />이 질문으로 진행</button>
        <button type="button" disabled={viewedIndex === questions.length - 1} onClick={() => advance(1)}>다음 미리보기<ChevronRight size={18} /></button>
      </div>
      <div className={styles.markerActions}>
        <button type="button" disabled={!isRecording || state.activeQuestionId !== viewed.id} onClick={addHighlight}><Star size={16} />좋은 답변 표시</button>
        <label><MessageSquarePlus size={16} /><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="현장 메모" /><button type="button" disabled={!isRecording || !note.trim()} onClick={() => { addFieldNote(note); setNote(""); }}>저장</button></label>
        <label><Pause size={16} /><input value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="후속 질문" /><button type="button" disabled={!isRecording || !followUp.trim()} onClick={() => { addFollowUp(followUp); setFollowUp(""); }}>추가</button></label>
      </div>
    </section>
  );
}
