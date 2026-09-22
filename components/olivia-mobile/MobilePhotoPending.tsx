"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, FolderOpen, HardDrive } from "lucide-react";
import { useMemo } from "react";
import { usePhotoProjectNotifications } from "@/components/photo-storage/PhotoProjectNotificationProvider";
import type { PhotoStorageProject } from "@/lib/photo-storage/types";
import styles from "./OliviaMobileShell.module.css";

const PENDING_STATUSES = new Set<PhotoStorageProject["status"]>([
  "READY", "MERGE_COMPLETED", "REVIEW_REQUIRED", "ERROR", "MERGE_FAILED", "COPY_FAILED", "CLASSIFY_FAILED",
]);

const STATUS_COPY: Partial<Record<PhotoStorageProject["status"], { label: string; next: string; danger?: boolean }>> = {
  READY: { label: "원본 확인됨", next: "JPG 통합 승인이 필요합니다" },
  MERGE_COMPLETED: { label: "JPG 통합 완료", next: "사진 분류 승인이 필요합니다" },
  REVIEW_REQUIRED: { label: "확인 필요", next: "충돌 또는 검증 결과를 확인해주세요", danger: true },
  ERROR: { label: "오류", next: "오류 내용을 확인해주세요", danger: true },
  MERGE_FAILED: { label: "JPG 통합 실패", next: "오류 확인 후 다시 시도할 수 있습니다", danger: true },
  COPY_FAILED: { label: "JPG 복사 실패", next: "오류 확인 후 다시 시도할 수 있습니다", danger: true },
  CLASSIFY_FAILED: { label: "사진 분류 실패", next: "오류 확인 후 다시 시도할 수 있습니다", danger: true },
};

function relativeUpdatedAt(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "방금 갱신";
  if (minutes < 60) return `${minutes}분 전 갱신`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}시간 전 갱신`;
  return `${Math.floor(minutes / 1_440)}일 전 갱신`;
}

function projectError(project: PhotoStorageProject) {
  return project.classification_error || project.copy_error || project.merge_error;
}

export default function MobilePhotoPending({
  onBack,
  onOpenProject,
}: {
  onBack: () => void;
  onOpenProject: () => void;
}) {
  const { projects, loading, error, selectProject, refresh } = usePhotoProjectNotifications();
  const pending = useMemo(() => projects
    .filter((project) => PENDING_STATUSES.has(project.status))
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()), [projects]);

  return (
    <section className={`${styles.screen} ${styles.mobilePhotoPendingScreen}`} aria-label="파일 분류 대기">
      <button type="button" className={styles.mobilePendingBack} onClick={onBack}>
        <ChevronLeft size={18} /> 홈
      </button>
      <header className={styles.mobilePendingHeading}>
        <span><FolderOpen size={22} /></span>
        <div>
          <h1>파일 분류 대기</h1>
          <p>확인하거나 승인해야 하는 촬영 폴더입니다.</p>
        </div>
        <b>{pending.length}</b>
      </header>

      {loading && !projects.length ? <div className={styles.emptyState}>대기 중인 폴더를 확인하고 있어요...</div> : null}
      {error && !projects.length ? (
        <div className={styles.errorState}>
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>다시 시도</button>
        </div>
      ) : null}
      {!loading && !error && !pending.length ? (
        <div className={styles.emptyState}>
          <HardDrive size={24} />
          <span>현재 확인이 필요한 사진 폴더가 없습니다.</span>
        </div>
      ) : null}

      <div className={styles.mobilePendingList}>
        {pending.map((project) => {
          const copy = STATUS_COPY[project.status] || { label: project.status, next: "상태를 확인해주세요" };
          const detail = projectError(project);
          return (
            <button
              key={project.id}
              type="button"
              className={copy.danger ? styles.mobilePendingItemDanger : undefined}
              onClick={() => {
                selectProject(project.id);
                onOpenProject();
              }}
            >
              <span className={styles.mobilePendingIcon}>{copy.danger ? <AlertTriangle size={19} /> : <FolderOpen size={19} />}</span>
              <span className={styles.mobilePendingCopy}>
                <span><strong>{project.project_name}</strong><em>{copy.label}</em></span>
                <small>{copy.next}</small>
                {detail ? <p>{detail}</p> : null}
                <i>JPG {project.jpg_count.toLocaleString("ko-KR")}장 · {relativeUpdatedAt(project.updated_at)}</i>
              </span>
              <ChevronRight size={18} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
