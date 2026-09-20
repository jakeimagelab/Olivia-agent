"use client";

import { AlertTriangle, Check, Clock3, HardDrive, X } from "lucide-react";
import { useState } from "react";
import { usePhotoProjectNotifications } from "./PhotoProjectNotificationProvider";
import type { PhotoStorageProject } from "@/lib/photo-storage/types";
import styles from "./PhotoProjectNotification.module.css";

const ACTIVE_STATUSES = new Set([
  "READY",
  "MERGE_APPROVED", "MERGING", "MERGE_COMPLETED", "MERGE_FAILED",
  "CLASSIFY_APPROVED",
  "COPY_QUEUED", "COPYING", "COPY_VERIFYING", "COPY_FAILED",
  "CLASSIFY_QUEUED", "CLASSIFYING", "CLASSIFY_VERIFYING", "CLASSIFY_FAILED",
]);

function formatBytes(bytes: number): string {
  if (!bytes) return "0B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)}${units[index]}`;
}

function percentOf(current: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
}

/** merge/copy/classify 단계 중 어디서 REVIEW_REQUIRED가 발생했는지는 그 단계의
 * error 컬럼으로만 구분할 수 있다(다음 단계로 넘어갈 때 초기화되므로 신뢰할 수 있다). */
function reviewStage(project: PhotoStorageProject): "merge" | "copy" | "classify" | null {
  if (project.merge_error) return "merge";
  if (project.copy_error) return "copy";
  if (project.classification_error) return "classify";
  return null;
}

export default function PhotoProjectNotification() {
  const { projects, events, lastAction, approve, defer, retry } = usePhotoProjectNotifications();
  const [busy, setBusy] = useState<"approve" | "defer" | "retry" | null>(null);
  const [dismissedCards, setDismissedCards] = useState<string[]>([]);
  const [showConflicts, setShowConflicts] = useState(false);
  const pending = projects.filter((project) =>
    (ACTIVE_STATUSES.has(project.status) || project.status === "REVIEW_REQUIRED")
    && !dismissedCards.includes(`${project.id}:${project.status}`)
  );
  const project = pending[0];
  const event = project ? events.find((candidate) => candidate.project_id === project.id && candidate.status === "OPEN") : undefined;
  const dismissCurrent = () => {
    if (!project) return;
    const key = `${project.id}:${project.status}`;
    setDismissedCards((current) => current.includes(key) ? current : [...current, key]);
  };

  const runAction = async (action: "approve" | "defer" | "retry") => {
    if (!project || busy) return;
    setBusy(action);
    try {
      if (action === "approve") await approve(project.id);
      else if (action === "defer") await defer(project.id);
      else await retry(project.id);
    } catch {
      // Provider refresh will expose the server state; keep the card available on transient errors.
    } finally {
      setBusy(null);
    }
  };

  if (lastAction) {
    const label = lastAction.action === "DEFERRED"
      ? "나중에 처리하도록 보류됨"
      : lastAction.project.status === "CLASSIFY_APPROVED" ? "사진 분류 승인됨 · 작업 대기" : "JPG 통합 승인됨 · 작업 대기";
    return <div className={styles.statusToast} role="status"><Check size={16} /><span>{lastAction.project.project_name} · {label}</span></div>;
  }
  if (!project) {
    const completed = projects.find((candidate) => candidate.status === "CLASSIFY_COMPLETED" && Date.now() - new Date(candidate.updated_at).getTime() < 10 * 60_000);
    if (!completed) return null;
    return <div className={styles.statusToast} role="status"><Check size={16} /><span>{completed.project_name} · 분류 완료 · {completed.scene_count.toLocaleString("ko-KR")}개 Scene · {completed.classified_jpg_count.toLocaleString("ko-KR")}장</span></div>;
  }

  // 상태 2 — MERGING / MERGE_APPROVED (1/2단계)
  if (project.status === "MERGING" || project.status === "MERGE_APPROVED") {
    const progress = project.merge_progress || {};
    const current = typeof progress.current === "number" ? progress.current : project.merged_jpg_count;
    const total = typeof progress.total === "number" ? progress.total : project.jpg_count;
    const percent = percentOf(current, total);
    const title = project.status === "MERGE_APPROVED" ? "통합을 준비하고 있습니다." : "SSD1에서 JPG를 통합하고 있습니다.";
    return (
      <aside className={styles.card} role="status">
        <button className={styles.close} type="button" aria-label="작업 상태 닫기" onClick={dismissCurrent}><X size={17} /></button>
        <div className={styles.icon}><HardDrive size={20} /></div>
        <div className={styles.content}>
          <p className={styles.eyebrow}>사진 작업 상태 · 1/2단계</p>
          <h2 className={styles.projectTitle}>{project.project_name} · {title}</h2>
          <p className={styles.detail}>{current.toLocaleString("ko-KR")} / {total.toLocaleString("ko-KR")}장 · {percent}%</p>
          <div className={styles.progressTrack}><span style={{ width: `${percent}%` }} /></div>
          <p className={styles.progressMessage}>RAW는 그대로 유지됩니다</p>
        </div>
      </aside>
    );
  }

  // 상태 3 — MERGE_COMPLETED (2차 승인 + 통합 리포트)
  if (project.status === "MERGE_COMPLETED") {
    return (
      <aside className={styles.card} role="status">
        <button className={styles.close} type="button" aria-label="알림 닫기" onClick={dismissCurrent}><X size={17} /></button>
        <div className={styles.icon}><Check size={20} /></div>
        <div className={styles.content}>
          <p className={styles.eyebrow}>원본 통합 완료</p>
          <h2 className={styles.projectTitle}>원본 통합이 완료되었습니다. 사진 분류를 시작할까요?</h2>
          <p className={styles.detail}>JPG {project.merged_jpg_count.toLocaleString("ko-KR")}장 통합 · RAW {project.raw_untouched_count.toLocaleString("ko-KR")}장 그대로 · 충돌 {project.merge_conflict_count.toLocaleString("ko-KR")}건</p>
          <div className={styles.actions}>
            <button className={styles.secondaryButton} type="button" disabled={Boolean(busy)} onClick={() => void runAction("defer")}><Clock3 size={15} /> 나중에</button>
            <button className={styles.primaryButton} type="button" disabled={Boolean(busy)} onClick={() => void runAction("approve")}>{busy === "approve" ? "처리 중..." : "사진 분류 시작"}</button>
          </div>
        </div>
      </aside>
    );
  }

  // 상태 4 — COPY_*/CLASSIFY_* 진행(2/2단계). CLASSIFY_APPROVED는 대기 중인 COPY_QUEUED와 동일하게 표시한다.
  if (["CLASSIFY_APPROVED", "COPY_QUEUED", "COPYING", "COPY_VERIFYING", "CLASSIFY_QUEUED", "CLASSIFYING", "CLASSIFY_VERIFYING"].includes(project.status)) {
    const isClassifyPhase = ["CLASSIFY_QUEUED", "CLASSIFYING", "CLASSIFY_VERIFYING"].includes(project.status);
    const progress = (isClassifyPhase ? project.classification_progress : project.copy_progress) || {};
    const current = typeof progress.current === "number" ? progress.current : (isClassifyPhase ? project.classified_jpg_count : project.copied_jpg_count);
    const total = typeof progress.total === "number" ? progress.total : project.jpg_count;
    const percent = percentOf(current, total);
    const title = project.status === "CLASSIFY_APPROVED" || project.status === "COPY_QUEUED" ? "복사를 준비하고 있습니다."
      : project.status === "COPYING" ? "JPG를 작업 SSD로 복사하고 있습니다."
      : project.status === "COPY_VERIFYING" ? "복사 결과를 확인하고 있습니다."
      : project.status === "CLASSIFY_QUEUED" ? "분류를 준비하고 있습니다."
      : project.status === "CLASSIFYING" ? "사진을 분류하고 있습니다."
      : "분류 결과를 확인하고 있습니다.";
    const copiedBytes = typeof progress.copiedBytes === "number" ? progress.copiedBytes : project.copied_jpg_bytes;
    const totalBytes = typeof progress.totalBytes === "number" ? progress.totalBytes : project.jpg_bytes;
    const detail = isClassifyPhase
      ? `경계 검증 ${current.toLocaleString("ko-KR")} / ${total.toLocaleString("ko-KR")} · ${percent}%`
      : `${current.toLocaleString("ko-KR")} / ${total.toLocaleString("ko-KR")}장 · ${percent}%${totalBytes > 0 ? ` · ${formatBytes(copiedBytes)} / ${formatBytes(totalBytes)}` : ""}`;
    return (
      <aside className={styles.card} role="status">
        <button className={styles.close} type="button" aria-label="작업 상태 닫기" onClick={dismissCurrent}><X size={17} /></button>
        <div className={styles.icon}><HardDrive size={20} /></div>
        <div className={styles.content}>
          <p className={styles.eyebrow}>사진 작업 상태 · 2/2단계</p>
          <h2 className={styles.projectTitle}>{project.project_name} · {title}</h2>
          <p className={styles.detail}>{detail}</p>
          <div className={styles.progressTrack}><span style={{ width: `${percent}%` }} /></div>
          <p className={styles.progressMessage}>Mac Studio에서 실행 중입니다</p>
        </div>
      </aside>
    );
  }

  // 상태 6 — REVIEW_REQUIRED / MERGE_FAILED / COPY_FAILED / CLASSIFY_FAILED
  if (project.status === "MERGE_FAILED" || project.status === "COPY_FAILED" || project.status === "CLASSIFY_FAILED" || project.status === "REVIEW_REQUIRED") {
    const stage = project.status === "MERGE_FAILED" ? "merge"
      : project.status === "COPY_FAILED" ? "copy"
      : project.status === "CLASSIFY_FAILED" ? "classify"
      : reviewStage(project);

    // stage를 판별할 수 없는 REVIEW_REQUIRED는 파이프라인 이전(발견 단계) 중복
    // 파일 알림이다 — 재시도 대상이 없으므로 기존처럼 닫기만 제공한다.
    if (!stage) {
      return (
        <aside className={styles.card} role="status">
          <button className={styles.close} type="button" aria-label="알림 닫기" onClick={dismissCurrent}><X size={17} /></button>
          <div className={styles.icon}><HardDrive size={20} /></div>
          <div className={styles.content}>
            <p className={styles.eyebrow}>촬영 파일 확인 필요</p>
            <h2 className={styles.projectTitle}>{project.project_name} 파일을 확인해야 합니다.</h2>
            <p className={styles.detail}>{event?.message || "동일한 JPG 파일이 이미 존재합니다."}</p>
            <button className={styles.secondaryButton} type="button" onClick={dismissCurrent}>확인</button>
          </div>
        </aside>
      );
    }

    const stageLabel = stage === "merge" ? "JPG 통합" : stage === "copy" ? "복사" : "분류";
    const errorText = stage === "merge" ? project.merge_error : stage === "copy" ? project.copy_error : project.classification_error;
    const isMergeConflict = project.status === "REVIEW_REQUIRED" && stage === "merge" && project.merge_conflict_count > 0;
    const title = isMergeConflict
      ? "같은 이름의 JPG가 있어 통합을 중단했습니다."
      : project.status === "REVIEW_REQUIRED"
        ? `${stageLabel} 결과를 확인해야 합니다.`
        : `${stageLabel} 중 문제가 발생했습니다.`;
    const conflicts = Array.isArray(event?.payload?.conflicts) ? event.payload.conflicts as Array<{ source: string; destination: string; reason: string }> : [];

    return (
      <aside className={`${styles.card} ${styles.cardDanger}`} role="alert">
        <button className={styles.close} type="button" aria-label="오류 알림 닫기" onClick={dismissCurrent}><X size={17} /></button>
        <div className={`${styles.icon} ${styles.iconDanger}`}><AlertTriangle size={20} /></div>
        <div className={styles.content}>
          <p className={`${styles.eyebrow} ${styles.eyebrowDanger}`}>확인 필요 · {stageLabel}</p>
          <h2 className={styles.projectTitle}>{project.project_name} {title}</h2>
          <p className={styles.detail}>{isMergeConflict ? `충돌 ${project.merge_conflict_count.toLocaleString("ko-KR")}건 · 파일은 하나도 옮기지 않았습니다. 원본은 그대로입니다.` : (errorText || "확인이 필요합니다.")}</p>
          {conflicts.length > 0 ? (
            <>
              <button className={styles.secondaryButton} type="button" onClick={() => setShowConflicts((current) => !current)}>{showConflicts ? "충돌 파일 숨기기" : "충돌 파일 보기"}</button>
              {showConflicts ? (
                <ul className={styles.conflictList}>
                  {conflicts.map((conflict, index) => <li key={`${conflict.source}-${index}`}>{conflict.source}</li>)}
                </ul>
              ) : null}
            </>
          ) : null}
          <div className={styles.actions}>
            <button className={styles.primaryButton} type="button" disabled={Boolean(busy)} onClick={() => void runAction("retry")}>{busy === "retry" ? "재요청 중..." : "다시 시도"}</button>
          </div>
        </div>
      </aside>
    );
  }

  // 상태 1 — READY (1차 승인)
  return (
    <aside className={styles.card} role="status">
      <button className={styles.close} type="button" aria-label="알림 닫기" onClick={dismissCurrent}><X size={17} /></button>
      <div className={styles.icon}><HardDrive size={20} /></div>
      <div className={styles.content}>
        <p className={styles.eyebrow}>새 촬영 파일</p>
        <h2 className={styles.projectTitle}>{project.project_name} 촬영 파일이 확인되었습니다.</h2>
        <p className={styles.detail}>RAW {project.raw_count.toLocaleString("ko-KR")}장 · JPG {project.jpg_count.toLocaleString("ko-KR")}장 · {formatBytes(project.jpg_bytes)}</p>
        <div className={styles.actions}>
          <button className={styles.secondaryButton} type="button" disabled={Boolean(busy)} onClick={() => void runAction("defer")}><Clock3 size={15} /> 나중에</button>
          <button className={styles.primaryButton} type="button" disabled={Boolean(busy)} onClick={() => void runAction("approve")}>{busy === "approve" ? "처리 중..." : "JPG 통합 시작"}</button>
        </div>
      </div>
      {pending.length > 1 ? <span className={styles.queue}>{pending.length}건</span> : null}
    </aside>
  );
}
