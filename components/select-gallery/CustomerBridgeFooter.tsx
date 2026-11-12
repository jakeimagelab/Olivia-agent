"use client";

import type { RefObject } from "react";
import { RotateCcw } from "lucide-react";
import styles from "./CustomerBridgeSelect.module.css";

export function CustomerBridgeFooter({
  readOnly,
  totalPhotoCount,
  selectedPhotoCount,
  saveStatus,
  saveStatusMessage,
  onRetrySave,
  downloadState,
  submitError,
  canFinalize,
  resetButtonRef,
  resetting,
  hasNotes,
  onReset,
  onReview,
  submitting,
  pendingCount,
  onSubmit,
}: {
  readOnly: boolean;
  totalPhotoCount: number;
  selectedPhotoCount: number;
  saveStatus: string;
  saveStatusMessage: string;
  onRetrySave: () => void;
  downloadState: string;
  submitError: string;
  canFinalize: boolean;
  resetButtonRef: RefObject<HTMLButtonElement | null>;
  resetting: boolean;
  hasNotes: boolean;
  onReset: () => void;
  onReview: () => void;
  submitting: boolean;
  pendingCount: number;
  onSubmit: () => void;
}) {
  if (readOnly) return null;
  const footerStatus = downloadState || submitError || (canFinalize ? saveStatusMessage : `${saveStatusMessage} · 최종 확정 권한 없음`);
  return <footer className={styles.footer}>
    <div className={styles.footerSummary}>
      <strong>전체 {totalPhotoCount.toLocaleString("ko-KR")}장 · 고객 셀렉 {selectedPhotoCount.toLocaleString("ko-KR")}장</strong>
      {saveStatus === "error" ? <button type="button" className={styles.saveRetry} onClick={onRetrySave}>{saveStatusMessage}</button> : <span>{footerStatus}</span>}
    </div>
    <button ref={resetButtonRef} className={styles.resetButton} type="button" disabled={resetting || (!selectedPhotoCount && !hasNotes)} onClick={onReset}><RotateCcw size={14} /> 셀렉 초기화</button>
    <button className={styles.reviewButton} type="button" disabled={!selectedPhotoCount} onClick={onReview}>리뷰</button>
    <button className={styles.submitButton} type="button" disabled={!selectedPhotoCount || submitting || pendingCount > 0 || saveStatus !== "saved" || !canFinalize} onClick={onSubmit}>{!canFinalize ? "확정 권한 없음" : submitting ? "제출 중" : "제출하기"}</button>
  </footer>;
}
