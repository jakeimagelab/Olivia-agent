"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Server, XCircle } from "lucide-react";
import PhotoProjectNotification from "@/components/photo-storage/PhotoProjectNotification";
import { usePhotoProjectNotifications } from "@/components/photo-storage/PhotoProjectNotificationProvider";
import { BackupReadyNotifications } from "./BackupReadyNotifications";
import BackgroundJobsWidget from "@/components/olivia/BackgroundJobsWidget";
import { ShootingProgressCards } from "@/components/shooting-progress/ShootingProgressCards";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import styles from "./OliviaDesktop.module.css";

type StatusPanelData = {
  worker: {
    id: string;
    online: boolean | null;
    worker_status: string | null;
    last_seen_at: string | null;
    nas_connected: boolean | null;
  };
  recentBackups: Array<{ id: string; folder_name: string; status: string; created_at: string }>;
  recentJobs: Array<{ id: string; action: string; status: string; created_at: string; completed_at: string | null }>;
  coreBypassIssues: Array<{
    workflowRunId: string;
    clientId: string | null;
    clientName: string;
    currentStepName: string;
    updatedAt: string;
  }>;
  consistencyError: string | null;
  hermesFallbackCount24h: number | null;
};

const CLOSED_POLL_MS = 60_000;
const OPEN_POLL_MS = 25_000;

const BACKUP_STATUS_LABEL: Record<string, string> = {
  PENDING: "대기", ACKNOWLEDGED: "확인함", STARTED: "시작함", COMPLETED: "완료", DISMISSED: "무시함",
};

const JOB_ACTION_LABEL: Record<string, string> = {
  PHOTO_SORT: "사진 분류", LIST_FOLDER: "폴더 조회", PHOTO_PREPARE_SOURCE: "JPG 통합",
  PHOTO_STAGE_JPG: "JPG 복사", PHOTO_CLASSIFY_WORK: "씬별 분류", COPY_TEST: "복사 테스트",
  PHOTO_RAW_MATCH: "RAW 매칭", PHOTO_RESIZE: "사진 리사이즈", PHOTO_AI_SELECT: "AI 컷 정리", PHOTO_RETOUCH: "사진 보정 분석",
};

const JOB_STATUS_LABEL: Record<string, string> = {
  QUEUED: "진행중", RUNNING: "진행중", COMPLETED: "완료", FAILED: "실패",
};

const ATTENTION_PROJECT_STATUSES = new Set([
  "READY", "ERROR", "REVIEW_REQUIRED", "MERGE_COMPLETED", "MERGE_FAILED",
  "COPY_FAILED", "CLASSIFY_FAILED", "MERGE_APPROVED", "MERGING",
  "CLASSIFY_APPROVED", "COPY_QUEUED", "COPYING", "COPY_VERIFYING",
  "CLASSIFY_QUEUED", "CLASSIFYING", "CLASSIFY_VERIFYING",
]);

// components/olivia-os/DesktopWidgets.tsx와 동일한 상대시각 포맷 — 이 저장소는 공용 유틸로
// 뽑지 않고 컴포넌트마다 이 정도 크기 함수는 로컬로 둔다(기존 관례).
function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1_440)}일 전`;
}

// 코드 요청서(2026-09-19) 상단바 상태표시 팝업. Mac Studio 연결/NAS 연결/최근 백업된 폴더/
// 최근 파일 작업을 GET /api/olivia-os/status-panel 하나로 모아서 보여준다. 폴링은 타이머
// 하나만 쓴다 — 패널이 닫혀 있으면 60초, 열리면 25초로 같은 타이머를 재시작한다(두 타이머가
// 동시에 같은 API를 중복 호출하지 않는다, 설계 문서 참고).
export function StatusPanelButton() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<StatusPanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);
  const { projects, shootingProgress, refresh: refreshPhotoProjects } = usePhotoProjectNotifications();
  const jobs = useBackgroundJobsStore((state) => state.jobs);
  const launchHref = useDesktopAppLauncher();

  const load = useCallback(async () => {
    setLoading(!hasLoadedRef.current);
    try {
      const response = await fetch("/api/olivia-os/status-panel", { cache: "no-store" });
      const body = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !body.ok) throw new Error("상태를 불러오지 못했습니다.");
      setData(body as StatusPanelData);
      setError(false);
      hasLoadedRef.current = true;
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // 타이머 하나만 쓴다 — open이 바뀔 때마다 이 effect가 다시 실행되면서 같은 간격의 다른
  // setInterval로 교체된다(닫힘 60초 / 열림 25초). 두 간격이 동시에 도는 일은 없다.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), open ? OPEN_POLL_MS : CLOSED_POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  const hasPendingWork = projects.some((project) => ATTENTION_PROJECT_STATUSES.has(project.status))
    || shootingProgress.length > 0
    || Object.keys(jobs).length > 0
    || Boolean(data?.recentBackups.some((backup) => backup.status === "PENDING"));
  const hasWarning = data ? data.worker.online === false || data.worker.nas_connected === false : false;
  const hasCoreWarning = Boolean(data?.coreBypassIssues?.length || data?.consistencyError);
  // PHASE 4 작업 1 R3(2026-09-25) — 폴백이 한 번이라도 있으면 대표가 그날 안에 알아야 한다.
  const hasFallbackWarning = Boolean(data?.hermesFallbackCount24h);

  return (
    <div className={styles.statusPanelGroup} ref={panelRef}>
      <button
        type="button"
        className={styles.topBarIconButton}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="시스템 상태"
        onClick={() => setOpen((current) => !current)}
      >
        <Server size={15} />
        {hasWarning || hasPendingWork || hasCoreWarning || hasFallbackWarning ? <span className={styles.statusPanelWarningDot} /> : null}
      </button>
      <div className={styles.statusPanel} role="dialog" aria-label="시스템 상태" hidden={!open}>
          <div className={styles.statusPanelHeader}>
            <span>상태 및 알림</span>
            <button type="button" className={styles.statusPanelRefresh} onClick={() => void load()} aria-label="새로고침" disabled={loading}>
              <RefreshCw size={13} className={loading ? styles.statusPanelSpin : undefined} />
            </button>
          </div>
          {shootingProgress.length ? (
            <div className={styles.statusPanelWorkSection}>
              <ShootingProgressCards
                cards={shootingProgress}
                variant="panel"
                onUpdated={refreshPhotoProjects}
                onOpenFolder={(card) => launchHref(`/remote-files?path=${encodeURIComponent(card.sourceRelativePath)}`, card.projectName)}
                onOpenClient={(clientId) => launchHref(`/clients?clientId=${encodeURIComponent(clientId)}`, undefined, { clientId })}
              />
            </div>
          ) : null}

          <PhotoProjectNotification variant="panel" />
          <BackupReadyNotifications variant="panel" />
          <BackgroundJobsWidget variant="panel" />

          {error && !data ? (
            <div className={styles.statusPanelError}>
              <span>상태를 불러오지 못했어요</span>
              <button type="button" onClick={() => void load()}>다시 시도</button>
            </div>
          ) : !data ? (
            <div className={styles.statusPanelSkeleton} />
          ) : (
            <>
              <div className={styles.statusPanelCard}>
                <div className={styles.statusPanelRow}>
                  {data.worker.online === true ? <CheckCircle2 size={16} className={styles.statusPanelIconOk} />
                    : data.worker.online === false ? <XCircle size={16} className={styles.statusPanelIconBad} />
                    : <AlertCircle size={16} className={styles.statusPanelIconUnknown} />}
                  <div className={styles.statusPanelRowBody}>
                    <strong>
                      {data.worker.online === true ? "맥스튜디오 정상 작동 중" : data.worker.online === false ? "맥스튜디오 오프라인" : "맥스튜디오 확인 안 됨"}
                      {data.worker.online && data.worker.worker_status ? ` · ${data.worker.worker_status === "busy" ? "작업 중" : data.worker.worker_status === "idle" ? "대기 중" : data.worker.worker_status}` : ""}
                    </strong>
                    <span>{data.worker.last_seen_at ? relativeTime(data.worker.last_seen_at) : "기록 없음"}</span>
                  </div>
                </div>
                <div className={styles.statusPanelSubRow}>
                  <span>NAS 연결</span>
                  <span className={data.worker.nas_connected === false ? styles.statusPanelBad : undefined}>
                    {data.worker.nas_connected === true ? "연결됨" : data.worker.nas_connected === false ? "연결 안 됨" : "확인 안 됨"}
                  </span>
                </div>
              </div>

              <div className={styles.statusPanelCard}>
                <div className={styles.statusPanelRow}>
                  {hasFallbackWarning
                    ? <XCircle size={16} className={styles.statusPanelIconBad} />
                    : <CheckCircle2 size={16} className={styles.statusPanelIconOk} />}
                  <div className={styles.statusPanelRowBody}>
                    <strong>최근 24시간 헤르메스 폴백 {data.hermesFallbackCount24h ?? 0}회</strong>
                    <span>
                      {data.hermesFallbackCount24h === null
                        ? "조회 실패"
                        : hasFallbackWarning
                          ? "헤르메스 대신 대체 처리 경로를 사용한 대화가 있어요 — 채팅에서 배지를 눌러 사유를 확인하세요."
                          : "지난 24시간 동안 헤르메스가 정상 응답했어요."}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.statusPanelSection}>
                <span className={styles.statusPanelSectionTitle}>Core 우회 의심</span>
                {data.consistencyError ? (
                  <p className={styles.statusPanelEmpty}>정합성 진단 실패 · {data.consistencyError}</p>
                ) : data.coreBypassIssues.length ? (
                  <ul className={styles.statusPanelList}>
                    {data.coreBypassIssues.map((issue) => (
                      <li key={issue.workflowRunId}>
                        <button
                          type="button"
                          className={styles.statusPanelListButton}
                          onClick={() => launchHref(
                            issue.clientId ? `/clients?clientId=${encodeURIComponent(issue.clientId)}` : "/clients",
                            issue.clientName || "워크플로우 정합성",
                            issue.clientId ? { clientId: issue.clientId } : undefined,
                          )}
                        >
                          <span className={styles.statusPanelListName}>{issue.clientName || "이름 없는 고객"}</span>
                          <span className={styles.statusPanelListMeta}>{issue.currentStepName} · {relativeTime(issue.updatedAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className={styles.statusPanelEmpty}>최근 Core 우회 의심 기록이 없어요.</p>}
              </div>

              <div className={styles.statusPanelSection}>
                <span className={styles.statusPanelSectionTitle}>최근 백업된 폴더</span>
                {data.recentBackups.length ? (
                  <ul className={styles.statusPanelList}>
                    {data.recentBackups.map((item) => (
                      <li key={item.id}>
                        <span className={styles.statusPanelListName}>{item.folder_name}</span>
                        <span className={styles.statusPanelListMeta}>{BACKUP_STATUS_LABEL[item.status] ?? item.status} · {relativeTime(item.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className={styles.statusPanelEmpty}>최근 감지된 백업이 없어요.</p>}
              </div>

              <div className={styles.statusPanelSection}>
                <span className={styles.statusPanelSectionTitle}>최근 파일 작업</span>
                {data.recentJobs.length ? (
                  <ul className={styles.statusPanelList}>
                    {data.recentJobs.map((item) => (
                      <li key={item.id}>
                        <span className={styles.statusPanelListName}>{JOB_ACTION_LABEL[item.action] ?? item.action}</span>
                        <span className={styles.statusPanelListMeta}>{JOB_STATUS_LABEL[item.status] ?? item.status} · {relativeTime(item.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className={styles.statusPanelEmpty}>최근 작업이 없어요.</p>}
              </div>
            </>
          )}
      </div>
    </div>
  );
}
