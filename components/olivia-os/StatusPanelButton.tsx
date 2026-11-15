"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock3,
  History,
  RefreshCw,
  Server,
  Square,
  UserRoundCheck,
  X,
} from "lucide-react";
import { usePhotoProjectNotifications } from "@/components/photo-storage/PhotoProjectNotificationProvider";
import RemotePhotoProgressDetails from "@/components/photo-workspace/RemotePhotoProgressDetails";
import { ShootingProgressCards } from "@/components/shooting-progress/ShootingProgressCards";
import {
  connectionStatusItems,
  DEFAULT_STATUS_PANEL_SECTIONS,
  hasConnectionProblem,
  parseStoredSectionState,
  retryableStatusIssueIds,
  STATUS_PANEL_STORAGE_KEY,
  statusPanelBadge,
  systemAttentionItems,
  type StatusPanelSectionKey,
  type StatusPanelSectionState,
} from "@/lib/system-status/panelModel";
import type { StatusPanelAction, StatusPanelEntry } from "@/lib/system-status/panelTypes";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";
import { cancelRemotePhotoSortJob } from "@/lib/photo-classifier/remotePhotoSort";
import { useRemotePhotoJobStore } from "@/lib/store/useRemotePhotoJobStore";
import { useOliviaRuntimeStatus } from "./OliviaRuntimeStatusProvider";
import {
  CompactedStatusPanelEntryList,
  relativeStatusTime,
  StatusPanelBrowserJobRow,
  StatusPanelConnectionRow,
  StatusPanelEntryRow,
  StatusPanelErrorBoundary,
  StatusPanelSection,
  type StatusPanelEntryActionState,
} from "./StatusPanelParts";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import styles from "./OliviaDesktop.module.css";

const TRANSIENT_RECHECK_MS = 30_000;

function StatusPanelButtonContent() {
  const [open, setOpen] = useState(false);
  const { data, loading, error, refresh } = useOliviaRuntimeStatus();
  const [actionStates, setActionStates] = useState<Record<string, StatusPanelEntryActionState>>({});
  const [deferredIssueIds, setDeferredIssueIds] = useState<Set<string>>(() => new Set());
  const [sections, setSections] = useState<StatusPanelSectionState>(DEFAULT_STATUS_PANEL_SECTIONS);
  const [showAllProgress, setShowAllProgress] = useState(false);
  const [selectedRemoteProgress, setSelectedRemoteProgress] = useState<StatusPanelEntry | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const recheckedIssueIdsRef = useRef(new Set<string>());
  const recheckTimersRef = useRef<number[]>([]);
  const autoActionIdsRef = useRef(new Set<string>());
  const { shootingProgress, refresh: refreshPhotoProjects } = usePhotoProjectNotifications();
  const backgroundJobMap = useBackgroundJobsStore((state) => state.jobs);
  const backgroundJobs = useMemo(() => Object.values(backgroundJobMap), [backgroundJobMap]);
  const launchHref = useDesktopAppLauncher();
  const load = useCallback(() => refresh({ force: true }), [refresh]);

  useEffect(() => {
    setSections(parseStoredSectionState(window.localStorage.getItem(STATUS_PANEL_STORAGE_KEY)));
  }, []);

  useEffect(() => () => {
    for (const timer of recheckTimersRef.current) window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!data) return;
    const pending = retryableStatusIssueIds(data).filter((id) => !recheckedIssueIdsRef.current.has(id));
    if (!pending.length) return;
    for (const id of pending) recheckedIssueIdsRef.current.add(id);
    setDeferredIssueIds((current) => new Set([...current, ...pending]));
    const timer = window.setTimeout(() => {
      void load().finally(() => {
        setDeferredIssueIds((current) => {
          const next = new Set(current);
          for (const id of pending) next.delete(id);
          return next;
        });
      });
    }, TRANSIENT_RECHECK_MS);
    recheckTimersRef.current.push(timer);
  }, [data, load]);

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

  const connectionItems = useMemo(() => connectionStatusItems(data?.diagnostics.items ?? []), [data]);
  const connectionProblem = hasConnectionProblem(data?.diagnostics.items ?? []);
  useEffect(() => {
    if (!connectionProblem) return;
    setSections((current) => current.connections ? current : { ...current, connections: true });
  }, [connectionProblem]);

  const issues = useMemo(
    () => data ? systemAttentionItems(data).filter((entry) => !deferredIssueIds.has(entry.id)) : [],
    [data, deferredIssueIds],
  );
  const badge = statusPanelBadge({ issues, myTurnCount: data?.myTurn.length ?? 0 });
  const effectiveBadge = error && !data ? { tone: "orange" as const, count: 1 } : badge;
  const rawServerProgress = data?.progress ?? [];
  const remoteJobProjectIds = new Set(
    rawServerProgress
      .filter((entry) => entry.kind === "remote_job_progress")
      .map((entry) => entry.projectId)
      .filter((projectId): projectId is string => Boolean(projectId)),
  );
  const visibleShootingProgress = shootingProgress.filter((card) => !card.actionRequired && !remoteJobProjectIds.has(card.projectId));
  const shootingProjectIds = new Set(visibleShootingProgress.map((card) => card.projectId));
  const serverProgress = rawServerProgress.filter((entry) => (
    entry.kind === "remote_job_progress" || !entry.projectId || !shootingProjectIds.has(entry.projectId)
  ));
  const progressCount = visibleShootingProgress.length + serverProgress.length + backgroundJobs.length;
  const displayedShootingProgress = showAllProgress
    ? visibleShootingProgress
    : visibleShootingProgress.slice(0, 5);
  const remainingProgressSlots = Math.max(0, 5 - displayedShootingProgress.length);
  const displayedServerProgress = showAllProgress
    ? serverProgress
    : serverProgress.slice(0, remainingProgressSlots);
  const remainingBackgroundSlots = Math.max(0, remainingProgressSlots - displayedServerProgress.length);
  const displayedBackgroundJobs = showAllProgress
    ? backgroundJobs
    : backgroundJobs.slice(0, remainingBackgroundSlots);
  const hiddenProgressCount = Math.max(0, progressCount - displayedShootingProgress.length - displayedServerProgress.length - displayedBackgroundJobs.length);
  const topBarProgressEntry = useMemo<StatusPanelEntry | null>(() => {
    const remoteEntry = serverProgress.find((entry) => entry.kind === "remote_job_progress") ?? serverProgress[0];
    if (remoteEntry) return remoteEntry;
    const shooting = visibleShootingProgress[0];
    if (!shooting) return null;
    return {
      id: `topbar-progress:${shooting.projectId}`,
      kind: "shooting_progress",
      level: "info",
      title: `${shooting.stageLabel} · ${shooting.projectName}`,
      detail: shooting.summary,
      href: `/photo-sorting?remoteFolder=${encodeURIComponent(shooting.sourceRelativePath)}`,
      projectId: shooting.projectId,
      workflowRunId: shooting.workflowRunId,
      progressPercent: shooting.progressPercent,
    };
  }, [serverProgress, visibleShootingProgress]);

  useEffect(() => {
    if (!selectedRemoteProgress?.remoteJob) return;
    const updated = serverProgress.find((entry) => entry.id === selectedRemoteProgress.id);
    if (updated) setSelectedRemoteProgress(updated);
  }, [selectedRemoteProgress?.id, selectedRemoteProgress?.remoteJob, serverProgress]);

  const showRemoteProgress = useCallback((entry: StatusPanelEntry) => {
    if (!entry.remoteJob) return;
    setSelectedRemoteProgress(entry);
    setSections((current) => current.progress ? current : { ...current, progress: true });
    setOpen(true);
  }, []);

  const toggleSection = useCallback((key: StatusPanelSectionKey) => {
    setSections((current) => {
      const next = { ...current, [key]: !current[key] };
      window.localStorage.setItem(STATUS_PANEL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const openEntry = useCallback((entry: Pick<StatusPanelEntry, "href" | "title" | "clientId" | "workflowRunId" | "projectId">) => {
    if (!entry.href) return;
    launchHref(entry.href, entry.title, {
      ...(entry.clientId ? { clientId: entry.clientId } : {}),
      ...(entry.workflowRunId ? { workflowRunId: entry.workflowRunId } : {}),
      ...(entry.projectId ? { projectId: entry.projectId } : {}),
    });
    setOpen(false);
  }, [launchHref]);

  const cancelTopBarJob = useCallback(async (entry: StatusPanelEntry) => {
    if (!entry.remoteJob || entry.remoteJob.status === "COMPLETED" || entry.remoteJob.status === "FAILED" || entry.remoteJob.status === "CANCELED") return;
    try {
      const updated = await cancelRemotePhotoSortJob(entry.remoteJob.id);
      useRemotePhotoJobStore.getState().setTrackedJob(updated);
      await load();
    } catch (cause) {
      setActionStates((current) => ({
        ...current,
        [`cancel:${entry.remoteJob!.id}`]: { message: cause instanceof Error ? cause.message : "취소 요청을 보내지 못했습니다.", error: true },
      }));
    }
  }, [load]);

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), refreshPhotoProjects()]);
  }, [load, refreshPhotoProjects]);

  const executeAction = useCallback(async (entry: StatusPanelEntry, action: StatusPanelAction) => {
    if (action.kind === "open" && action.href) {
      openEntry({ ...entry, href: action.href });
      return;
    }
    if (action.kind === "external" && action.href) {
      window.open(action.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (action.kind === "copy" && action.value) {
      try {
        await navigator.clipboard.writeText(action.value);
        setActionStates((current) => ({ ...current, [action.id]: { message: "클립보드에 복사했습니다." } }));
      } catch {
        setActionStates((current) => ({ ...current, [action.id]: { message: "복사하지 못했습니다.", error: true } }));
      }
      return;
    }
    if (action.kind !== "api" || !action.endpoint) return;
    setActionStates((current) => ({ ...current, [action.id]: { loading: true } }));
    try {
      const response = await fetch(action.endpoint, {
        method: action.method ?? "POST",
        headers: action.body ? { "Content-Type": "application/json" } : undefined,
        body: action.body ? JSON.stringify(action.body) : undefined,
      });
      const body = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !body.ok) throw new Error(body.error || "요청을 처리하지 못했습니다.");
      setActionStates((current) => ({
        ...current,
        [action.id]: { message: action.auto ? "일시적 오류라 자동으로 한 번 다시 시도했습니다." : "처리했습니다." },
      }));
      await refreshAll();
    } catch (cause) {
      setActionStates((current) => ({
        ...current,
        [action.id]: { message: cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다.", error: true },
      }));
    }
  }, [openEntry, refreshAll]);

  useEffect(() => {
    if (!data) return;
    const entries = [...(data.panelIssues ?? []), ...(data.myTurn ?? []), ...(data.progress ?? []), ...(data.recentActivity ?? [])];
    for (const entry of entries) {
      for (const action of entry.actions ?? []) {
        if (!action.auto || autoActionIdsRef.current.has(action.id)) continue;
        autoActionIdsRef.current.add(action.id);
        void executeAction(entry, action);
      }
    }
  }, [data, executeAction]);

  return (
    <div className={styles.statusPanelGroup} ref={panelRef}>
      {topBarProgressEntry ? (
        <div className={styles.statusPanelActiveGroup}>
          <button
            type="button"
            className={styles.statusPanelActiveChip}
            onClick={() => topBarProgressEntry.remoteJob ? showRemoteProgress(topBarProgressEntry) : openEntry(topBarProgressEntry)}
            title={`${topBarProgressEntry.title}${topBarProgressEntry.detail ? ` · ${topBarProgressEntry.detail}` : ""}`}
          >
            <RefreshCw size={11} className={styles.statusPanelSpin} />
            <span>{topBarProgressEntry.title}</span>
            {typeof topBarProgressEntry.progressPercent === "number" ? <b>{topBarProgressEntry.progressPercent}%</b> : null}
            {typeof topBarProgressEntry.progressPercent === "number" ? <i className={styles.statusPanelActiveGauge}><i style={{ width: `${topBarProgressEntry.progressPercent}%` }} /></i> : null}
          </button>
          {topBarProgressEntry.remoteJob && !topBarProgressEntry.remoteJob.cancelRequested ? (
            <button type="button" className={styles.statusPanelActiveCancel} onClick={() => void cancelTopBarJob(topBarProgressEntry)} title="작업 취소" aria-label="사진 분류 작업 취소"><Square size={10} fill="currentColor" /> 취소</button>
          ) : topBarProgressEntry.remoteJob?.cancelRequested ? <small className={styles.statusPanelCancelPending}>취소 요청됨</small> : null}
        </div>
      ) : null}
      <button
        type="button"
        className={`${styles.topBarIconButton} ${styles.statusPanelTrigger}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={effectiveBadge.count ? `시스템 상태, 확인 ${effectiveBadge.count}건` : "시스템 상태"}
        onClick={() => setOpen((current) => !current)}
      >
        <UserRoundCheck size={15} />
        <span>내 차례 {data?.myTurn.length ?? 0}</span>
        {effectiveBadge.tone !== "none" ? (
          <span className={`${styles.statusPanelBadge} ${styles[`statusPanelBadge_${effectiveBadge.tone}`]}`}>
            {effectiveBadge.count > 9 ? "9+" : effectiveBadge.count}
          </span>
        ) : null}
      </button>

      <div className={styles.statusPanel} role="dialog" aria-label="상태 및 알림" hidden={!open}>
        <div className={styles.statusPanelHeader}>
          <span>상태 및 알림</span>
          <button type="button" className={styles.statusPanelRefresh} onClick={() => void refreshAll()} aria-label="새로고침" disabled={loading}>
            <RefreshCw size={13} className={loading ? styles.statusPanelSpin : undefined} />
            <span>새로고침</span>
          </button>
          <button type="button" className={styles.statusPanelRefresh} onClick={() => setOpen(false)} aria-label="상태 및 알림 닫기">
            <X size={14} />
          </button>
        </div>

        {error && !data ? (
          <div className={styles.statusPanelError}>
            <span>상태를 불러오지 못했어요</span>
            <button type="button" onClick={() => void load()}>다시 시도</button>
          </div>
        ) : !data ? <div className={styles.statusPanelSkeleton} /> : (
          <>
            {selectedRemoteProgress?.remoteJob ? (
              <section className={styles.statusPanelPhotoProgressDetail} aria-label="사진 분류 상세 진행 상황">
                <div className={styles.statusPanelPhotoProgressDetailHeader}>
                  <span>현재 사진 작업</span>
                  <button type="button" onClick={() => setSelectedRemoteProgress(null)}>상세 닫기</button>
                </div>
                <RemotePhotoProgressDetails
                  job={selectedRemoteProgress.remoteJob}
                  sourceFolder={selectedRemoteProgress.sourceFolder}
                />
              </section>
            ) : null}
            {issues.length ? (
              <section className={`${styles.statusPanelSection} ${styles.statusPanelUrgent}`} aria-label="지금 확인할 것">
                <div className={styles.statusPanelUrgentTitle}>
                  <span><AlertTriangle size={14} />지금 확인할 것</span>
                  <b>{issues.length}</b>
                </div>
                <div className={styles.statusPanelSectionBody}>
                  <CompactedStatusPanelEntryList
                    entries={issues}
                    empty={null}
                    onOpen={openEntry}
                    onAction={executeAction}
                    actionStates={actionStates}
                  />
                </div>
              </section>
            ) : null}

            <StatusPanelSection
              icon={<UserRoundCheck size={14} />}
              label="내 차례"
              count={data.myTurn.length}
              open={sections.myTurn}
              onToggle={() => toggleSection("myTurn")}
            >
              <CompactedStatusPanelEntryList
                entries={data.myTurn}
                empty={<p className={styles.statusPanelEmpty}>지금 직접 확인할 항목이 없습니다.</p>}
                onOpen={openEntry}
                onAction={executeAction}
                actionStates={actionStates}
              />
            </StatusPanelSection>

            <StatusPanelSection
              icon={<Activity size={14} />}
              label="진행 중"
              count={progressCount}
              open={sections.progress}
              onToggle={() => toggleSection("progress")}
            >
              {displayedShootingProgress.length ? (
                <div className={styles.statusPanelWorkSection}>
                  <ShootingProgressCards
                    cards={displayedShootingProgress}
                    variant="panel"
                    onUpdated={refreshPhotoProjects}
                    onOpenFolder={(card) => launchHref(`/remote-files?path=${encodeURIComponent(card.sourceRelativePath)}`, card.projectName)}
                    onOpenClient={(clientId) => launchHref(`/clients?clientId=${encodeURIComponent(clientId)}`, undefined, { clientId })}
                  />
                </div>
              ) : null}
              {displayedServerProgress.map((entry) => (
                <StatusPanelEntryRow
                  key={entry.id}
                  entry={entry}
                  onOpen={openEntry}
                  onAction={executeAction}
                  actionStates={actionStates}
                />
              ))}
              {displayedBackgroundJobs.map((job) => <StatusPanelBrowserJobRow key={job.id} job={job} onOpen={(href, title) => { launchHref(href, title); setOpen(false); }} />)}
              {!showAllProgress && hiddenProgressCount > 0 ? (
                <button type="button" className={styles.statusPanelListDisclosure} onClick={() => setShowAllProgress(true)}>{hiddenProgressCount}건 더 보기</button>
              ) : null}
              {progressCount === 0 ? <p className={styles.statusPanelEmpty}>현재 진행 중인 작업이 없습니다.</p> : null}
            </StatusPanelSection>

            <StatusPanelSection
              icon={<Server size={14} />}
              label="연결 상태"
              summary={connectionProblem ? `${connectionItems.filter((item) => item.level !== "ok").length}개 확인` : "모두 정상 ✓"}
              open={sections.connections}
              onToggle={() => toggleSection("connections")}
            >
              {connectionItems.map((item) => <StatusPanelConnectionRow key={item.id} item={item} />)}
            </StatusPanelSection>

            <StatusPanelSection
              icon={<History size={14} />}
              label="최근 기록"
              count={data.recentActivity.length}
              open={sections.recent}
              onToggle={() => toggleSection("recent")}
            >
              <CompactedStatusPanelEntryList
                entries={data.recentActivity}
                empty={<p className={styles.statusPanelEmpty}>최근 기록이 없습니다.</p>}
                onOpen={openEntry}
                onAction={executeAction}
                actionStates={actionStates}
              />
              <div className={styles.statusPanelCheckedAt}><Clock3 size={11} />{relativeStatusTime(data.checkedAt)} 확인</div>
            </StatusPanelSection>
          </>
        )}
      </div>
    </div>
  );
}

export function StatusPanelButton() {
  return (
    <StatusPanelErrorBoundary>
      <StatusPanelButtonContent />
    </StatusPanelErrorBoundary>
  );
}
