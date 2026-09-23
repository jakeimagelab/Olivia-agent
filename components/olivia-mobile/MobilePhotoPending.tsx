"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock3,
  FolderOpen,
  HardDrive,
  RefreshCw,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { usePhotoProjectNotifications } from "@/components/photo-storage/PhotoProjectNotificationProvider";
import {
  isPhotoProjectActive,
  isPhotoProjectPendingVisible,
  sceneClassificationRequirement,
} from "@/lib/photo-storage/notificationPolicy";
import type { PhotoStorageProject } from "@/lib/photo-storage/types";
import styles from "./OliviaMobileShell.module.css";

type PendingAction = "approve" | "defer" | "complete" | "retry";

const RETRYABLE_STATUSES = new Set<PhotoStorageProject["status"]>([
  "REVIEW_REQUIRED", "MERGE_FAILED", "COPY_FAILED", "CLASSIFY_FAILED",
]);

function relativeUpdatedAt(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "방금 갱신";
  if (minutes < 60) return `${minutes}분 전 갱신`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}시간 전 갱신`;
  return `${Math.floor(minutes / 1_440)}일 전 갱신`;
}

function formattedTime(value: string | null) {
  if (!value) return null;
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
}

function deferCopy(value: string | null) {
  if (!value) return null;
  const remaining = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const hours = Math.max(1, Math.ceil(remaining / 3_600_000));
  return hours > 24 ? `보류 중 · ${Math.ceil(hours / 24)}일 후 목록에서 제거` : `보류 중 · ${hours}시간 후 목록에서 제거`;
}

function projectError(project: PhotoStorageProject) {
  if (project.merge_error) return { stage: "JPG 통합", message: project.merge_error };
  if (project.copy_error) return { stage: "SSD2 복사", message: project.copy_error };
  if (project.classification_error) return { stage: "씬 분류", message: project.classification_error };
  return null;
}

function progressOf(project: PhotoStorageProject) {
  const progress = project.status === "MERGING" ? project.merge_progress
    : project.status.startsWith("CLASSIFY") ? project.classification_progress
      : project.copy_progress;
  const current = typeof progress?.current === "number" ? progress.current : 0;
  const total = typeof progress?.total === "number" ? progress.total : project.jpg_count;
  return total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
}

function statusCopy(project: PhotoStorageProject) {
  const requirement = sceneClassificationRequirement(project);
  if (project.status === "READY" || project.status === "DEFERRED") {
    return { label: "원본 확인됨", next: "승인하면 JPG 원본 분리를 시작합니다." };
  }
  if (project.status === "MERGE_COMPLETED") {
    if (requirement === "required") return { label: "씬 분류 대기", next: "승인하면 SSD2 복사와 씬 분류를 자동으로 시작합니다." };
    if (requirement === "not_required") return { label: "원본 분리 완료", next: "씬 분류가 필요 없는 촬영입니다. 완료 처리해주세요." };
    const missing = project.nas_department ? "촬영모드" : "진료과";
    return { label: "설정 확인 필요", next: `${missing}가 없어 자동 분류를 시작할 수 없습니다.`, danger: true };
  }
  if (project.status === "MERGE_APPROVED") return { label: "승인됨", next: "JPG 통합 작업을 기다리고 있습니다." };
  if (project.status === "MERGING") return { label: "JPG 통합 중", next: `원본 분리 작업 ${progressOf(project)}% 진행 중입니다.` };
  if (project.status === "CLASSIFY_APPROVED" || project.status === "COPY_QUEUED") return { label: "승인됨", next: "SSD2 복사 작업을 기다리고 있습니다." };
  if (project.status === "COPYING" || project.status === "COPY_VERIFYING" || project.status === "COPY_COMPLETED") {
    return { label: "SSD2 복사 중", next: `복사 작업 ${progressOf(project)}% 진행 중입니다.` };
  }
  if (project.status === "CLASSIFY_QUEUED" || project.status === "CLASSIFYING" || project.status === "CLASSIFY_VERIFYING") {
    return { label: "씬 분류 중", next: `사진 분류 ${progressOf(project)}% 진행 중입니다.` };
  }
  if (project.status === "REVIEW_REQUIRED") return { label: "확인 필요", next: "검증 결과를 확인한 뒤 다시 시도해주세요.", danger: true };
  if (project.status === "ERROR") return { label: "오류", next: "오류 내용을 확인해주세요.", danger: true };
  if (project.status === "MERGE_FAILED") return { label: "JPG 통합 실패", next: "원본은 변경되지 않았습니다.", danger: true };
  if (project.status === "COPY_FAILED") return { label: "SSD2 복사 실패", next: "원본은 변경되지 않았습니다.", danger: true };
  return { label: "씬 분류 실패", next: "오류 확인 후 다시 시도할 수 있습니다.", danger: true };
}

export default function MobilePhotoPending({ onBack }: { onBack: () => void }) {
  const { projects, loading, error, selectProject, refresh, approve, defer, complete, retry } = usePhotoProjectNotifications();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ projectId: string; action: PendingAction } | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const visibleProjects = useMemo(() => projects
    .filter((project) => isPhotoProjectActive(project) || isPhotoProjectPendingVisible(project))
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()), [projects]);

  const runAction = async (project: PhotoStorageProject, action: PendingAction) => {
    if (busy) return;
    setBusy({ projectId: project.id, action });
    setActionErrors((current) => ({ ...current, [project.id]: "" }));
    try {
      if (action === "approve") await approve(project.id);
      else if (action === "defer") await defer(project.id);
      else if (action === "complete") await complete(project.id);
      else await retry(project.id);
    } catch (cause) {
      setActionErrors((current) => ({
        ...current,
        [project.id]: cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다.",
      }));
    } finally {
      setBusy(null);
    }
  };

  const confirmComplete = (project: PhotoStorageProject) => {
    if (!window.confirm("목록에서 완료 처리할까요? 사진 파일은 삭제되지 않습니다.")) return;
    void runAction(project, "complete");
  };

  return (
    <section className={`${styles.screen} ${styles.mobilePhotoPendingScreen}`} aria-label="파일 분류 대기">
      <button type="button" className={styles.mobilePendingBack} onClick={onBack}>
        <ChevronLeft size={18} /> 홈
      </button>
      <header className={styles.mobilePendingHeading}>
        <span><FolderOpen size={22} /></span>
        <div>
          <h1>사진 작업 확인</h1>
          <p>화면 이동 없이 승인·보류·완료할 수 있습니다.</p>
        </div>
        <b>{visibleProjects.length}</b>
      </header>

      {loading && !projects.length ? <div className={styles.emptyState}>확인이 필요한 폴더를 불러오고 있어요...</div> : null}
      {error && !projects.length ? (
        <div className={styles.errorState}>
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>다시 시도</button>
        </div>
      ) : null}
      {!loading && !error && !visibleProjects.length ? (
        <div className={styles.emptyState}>
          <HardDrive size={24} />
          <span>현재 확인하거나 진행 중인 사진 작업이 없습니다.</span>
        </div>
      ) : null}

      <div className={styles.mobilePendingList}>
        {visibleProjects.map((project) => {
          const copy = statusCopy(project);
          const detail = projectError(project);
          const expanded = expandedId === project.id;
          const projectBusy = busy?.projectId === project.id;
          const requirement = sceneClassificationRequirement(project);
          const deferred = deferCopy(project.notification_deferred_until);
          const mergedAt = formattedTime(project.merge_completed_at);
          const active = isPhotoProjectActive(project);
          const canApprove = project.status === "READY" || project.status === "DEFERRED"
            || (project.status === "MERGE_COMPLETED" && requirement === "required");
          const canRetry = RETRYABLE_STATUSES.has(project.status);
          const canComplete = project.status === "MERGE_COMPLETED" && requirement !== "required";
          return (
            <article key={project.id} className={`${styles.mobilePendingItem} ${copy.danger ? styles.mobilePendingItemDanger : ""} ${expanded ? styles.mobilePendingItemExpanded : ""}`}>
              <button
                type="button"
                className={styles.mobilePendingSummary}
                aria-expanded={expanded}
                onClick={() => {
                  const next = expanded ? null : project.id;
                  setExpandedId(next);
                  selectProject(next);
                }}
              >
                <span className={styles.mobilePendingIcon}>{copy.danger ? <AlertTriangle size={19} /> : active ? <Clock3 size={19} /> : <FolderOpen size={19} />}</span>
                <span className={styles.mobilePendingCopy}>
                  <span><strong>{project.project_name}</strong><em>{copy.label}</em></span>
                  <small>{copy.next}</small>
                  {deferred ? <i className={styles.mobilePendingDeferred}>{deferred}</i> : null}
                  <i>JPG {project.jpg_count.toLocaleString("ko-KR")}장 · {relativeUpdatedAt(project.updated_at)}</i>
                </span>
                {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              <button
                type="button"
                className={styles.mobilePendingDismiss}
                aria-label={`${project.project_name} 완료 처리`}
                disabled={projectBusy || active}
                onClick={() => confirmComplete(project)}
              >
                <X size={16} />
              </button>

              {expanded ? (
                <div className={styles.mobilePendingDetail}>
                  <dl>
                    <div><dt>원본</dt><dd>RAW {project.raw_count.toLocaleString("ko-KR")}장 · JPG {project.jpg_count.toLocaleString("ko-KR")}장</dd></div>
                    <div><dt>JPG 통합</dt><dd>{project.merged_jpg_count.toLocaleString("ko-KR")}장{mergedAt ? ` · ${mergedAt} 완료` : ""}</dd></div>
                    {project.nas_department ? <div><dt>진료과</dt><dd>{project.nas_department}</dd></div> : null}
                    {project.nas_shooting_mode ? <div><dt>촬영모드</dt><dd>{project.nas_shooting_mode === "field" ? "현장" : "스튜디오"}</dd></div> : null}
                  </dl>
                  {detail ? <p className={styles.mobilePendingError}><AlertTriangle size={14} /><span><strong>{detail.stage}</strong>{detail.message}</span></p> : null}
                  {actionErrors[project.id] ? <p className={styles.mobilePendingActionError}>{actionErrors[project.id]}</p> : null}
                  {active ? <div className={styles.mobilePendingProgress}><span style={{ width: `${progressOf(project)}%` }} /></div> : null}
                  {!active ? (
                    <div className={styles.mobilePendingActions}>
                      <button type="button" disabled={projectBusy} onClick={() => void runAction(project, "defer")}><Clock3 size={15} />{busy?.projectId === project.id && busy.action === "defer" ? "처리 중..." : "보류"}</button>
                      {canRetry ? <button type="button" disabled={projectBusy} onClick={() => void runAction(project, "retry")}><RefreshCw size={15} />{busy?.projectId === project.id && busy.action === "retry" ? "재요청 중..." : "다시 시도"}</button> : null}
                      {canComplete ? <button type="button" className={styles.mobilePendingComplete} disabled={projectBusy} onClick={() => void runAction(project, "complete")}><Check size={15} />{busy?.projectId === project.id && busy.action === "complete" ? "처리 중..." : "완료"}</button> : null}
                      {canApprove ? <button type="button" className={styles.mobilePendingApprove} disabled={projectBusy} onClick={() => void runAction(project, "approve")}><Check size={15} />{busy?.projectId === project.id && busy.action === "approve" ? "승인 중..." : project.status === "MERGE_COMPLETED" ? "분류 승인" : "원본 분리 승인"}</button> : null}
                    </div>
                  ) : <p className={styles.mobilePendingActiveCopy}>자동 작업이 진행 중입니다. 완료되면 목록에서 사라집니다.</p>}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
