"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  History,
  RefreshCw,
  Server,
  Square,
  UserRoundCheck,
} from "lucide-react";
import { usePhotoProjectNotifications } from "@/components/photo-storage/PhotoProjectNotificationProvider";
import RemoteJobProgress from "@/components/photo-workspace/RemoteJobProgress";
import RemotePhotoProgressDetails from "@/components/photo-workspace/RemotePhotoProgressDetails";
import { ShootingProgressCards } from "@/components/shooting-progress/ShootingProgressCards";
import { logOliviaError } from "@/lib/errors/errorDiagnostics";
import {
  connectionStatusItems,
  DEFAULT_STATUS_PANEL_SECTIONS,
  groupStatusPanelEntries,
  hasConnectionProblem,
  limitStatusPanelEntryGroups,
  normalizeStatusPanelData,
  parseStoredSectionState,
  retryableStatusIssueIds,
  STATUS_PANEL_STORAGE_KEY,
  statusPanelBadge,
  splitStaleStatusPanelEntries,
  systemAttentionItems,
  type StatusPanelSectionKey,
  type StatusPanelSectionState,
} from "@/lib/system-status/panelModel";
import type { StatusPanelAction, StatusPanelData, StatusPanelEntry } from "@/lib/system-status/panelTypes";
import type { SystemStatusItem } from "@/lib/system-status/types";
import { useBackgroundJobsStore, type BackgroundJob } from "@/lib/store/useBackgroundJobsStore";
import { cancelRemotePhotoSortJob } from "@/lib/photo-classifier/remotePhotoSort";
import { useRemotePhotoJobStore } from "@/lib/store/useRemotePhotoJobStore";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import styles from "./OliviaDesktop.module.css";

const CLOSED_POLL_MS = 60_000;
const OPEN_POLL_MS = 25_000;
const ACTIVE_PHOTO_POLL_MS = 5_000;
const TRANSIENT_RECHECK_MS = 30_000;

type EntryActionState = { loading?: boolean; message?: string; error?: boolean };

class StatusPanelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logOliviaError("status-panel", error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.failed) {
      return (
        <button
          type="button"
          className={styles.topBarIconButton}
          aria-label="시스템 상태 확인 안 됨"
          title="상태표시줄을 불러오지 못했습니다. 다른 기능은 계속 사용할 수 있습니다."
          onClick={() => this.setState({ failed: false })}
        >
          <Server size={15} />
          <span className={`${styles.statusPanelBadge} ${styles.statusPanelBadge_orange}`}>!</span>
        </button>
      );
    }
    return this.props.children;
  }
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "시각 확인 불가";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "시각 확인 불가";
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1_440)}일 전`;
}

function PanelSection({
  icon,
  label,
  count,
  summary,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={styles.statusPanelSection}>
      <button
        type="button"
        className={styles.statusPanelSectionButton}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={styles.statusPanelSectionLabel}>{icon}{label}</span>
        <span className={styles.statusPanelSectionSummary}>
          {summary || (typeof count === "number" ? `${count}건` : null)}
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open ? <div className={styles.statusPanelSectionBody}>{children}</div> : null}
    </section>
  );
}

function EntryRow({
  entry,
  onOpen,
  onAction,
  actionStates,
}: {
  entry: StatusPanelEntry;
  onOpen: (entry: StatusPanelEntry) => void;
  onAction: (entry: StatusPanelEntry, action: StatusPanelAction) => void;
  actionStates: Record<string, EntryActionState>;
}) {
  const content = (
    <>
      <span className={`${styles.statusPanelSeverity} ${styles[`statusPanelSeverity_${entry.level}`]}`} aria-hidden="true" />
      <span className={styles.statusPanelEntryText}>
        <strong>{entry.title}</strong>
        {entry.detail || entry.createdAt ? (
          <small>{entry.detail || "상태 확인"}{entry.createdAt ? ` · ${relativeTime(entry.createdAt)}` : ""}</small>
        ) : null}
        {!entry.remoteJob && typeof entry.progressPercent === "number" ? (
          <span className={styles.statusPanelProgress} aria-label={`진행률 ${entry.progressPercent}%`}>
            <i style={{ width: `${entry.progressPercent}%` }} />
          </span>
        ) : null}
      </span>
      {entry.href ? <ChevronRight size={14} className={styles.statusPanelEntryArrow} /> : null}
    </>
  );
  const feedback = (entry.actions ?? []).map((action) => actionStates[action.id]).find((state) => state?.message);
  return (
    <div className={styles.statusPanelEntryGroup}>
      {entry.href ? (
        <button type="button" className={`${styles.statusPanelEntry} ${styles.statusPanelEntryMain}`} onClick={() => onOpen(entry)}>{content}</button>
      ) : (
        <div className={`${styles.statusPanelEntry} ${styles.statusPanelEntryMain}`}>{content}</div>
      )}
      {entry.remoteJob ? (
        <button type="button" className={styles.statusPanelRemoteProgress} onClick={() => onOpen(entry)}>
          <RemoteJobProgress job={entry.remoteJob} pollingState="connected" compact label={entry.title} />
        </button>
      ) : null}
      {entry.actions?.length ? (
        <div className={styles.statusPanelEntryActions}>
          {entry.actions.slice(0, 3).map((action) => {
            const state = actionStates[action.id];
            return (
              <button
                key={action.id}
                type="button"
                className={action.tone === "primary" ? styles.statusPanelActionPrimary : styles.statusPanelActionSecondary}
                disabled={state?.loading}
                onClick={() => onAction(entry, action)}
              >
                {action.kind === "copy" ? <Copy size={11} /> : action.kind === "external" ? <ExternalLink size={11} /> : null}
                {state?.loading ? "처리 중" : action.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {feedback?.message ? (
        <p className={feedback.error ? styles.statusPanelActionError : styles.statusPanelActionSuccess}>{feedback.message}</p>
      ) : null}
    </div>
  );
}

/** 긴 알림 목록은 최근·중요 항목만 먼저 보이고, 중복 대상과 오래된 기록은 필요할 때 펼친다. */
function CompactedEntryList({
  entries,
  empty,
  onOpen,
  onAction,
  actionStates,
}: {
  entries: readonly StatusPanelEntry[];
  empty: ReactNode;
  onOpen: (entry: StatusPanelEntry) => void;
  onAction: (entry: StatusPanelEntry, action: StatusPanelAction) => void;
  actionStates: Record<string, EntryActionState>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showStale, setShowStale] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const { recent, stale } = useMemo(() => splitStaleStatusPanelEntries({ entries }), [entries]);
  const recentGroups = useMemo(() => groupStatusPanelEntries(recent), [recent]);
  const staleGroups = useMemo(() => groupStatusPanelEntries(stale), [stale]);
  const visibleGroups = showAll ? recentGroups : limitStatusPanelEntryGroups(recentGroups);
  const hiddenCount = recentGroups.slice(visibleGroups.length).reduce((count, group) => count + group.entries.length, 0);

  const renderGroup = (group: ReturnType<typeof groupStatusPanelEntries>[number]) => {
    if (group.entries.length === 1) {
      const entry = group.entries[0];
      return entry ? <EntryRow key={entry.id} entry={entry} onOpen={onOpen} onAction={onAction} actionStates={actionStates} /> : null;
    }
    const expanded = expandedGroups.has(group.id);
    return (
      <div key={group.id} className={styles.statusPanelEntryGroup}>
        <button
          type="button"
          className={`${styles.statusPanelEntry} ${styles.statusPanelGroupedEntry}`}
          onClick={() => setExpandedGroups((current) => {
            const next = new Set(current);
            if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
            return next;
          })}
          aria-expanded={expanded}
        >
          <span className={`${styles.statusPanelSeverity} ${styles[`statusPanelSeverity_${group.level}`]}`} aria-hidden="true" />
          <span className={styles.statusPanelEntryText}>
            <strong>{group.title} {group.entries.length}건</strong>
            <small>대상별로 확인하려면 펼치세요.</small>
          </span>
          {expanded ? <ChevronDown size={14} className={styles.statusPanelEntryArrow} /> : <ChevronRight size={14} className={styles.statusPanelEntryArrow} />}
        </button>
        {expanded ? group.entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} onOpen={onOpen} onAction={onAction} actionStates={actionStates} />
        )) : null}
      </div>
    );
  };

  if (!recentGroups.length && !staleGroups.length) return <>{empty}</>;
  return (
    <>
      {visibleGroups.map(renderGroup)}
      {!showAll && hiddenCount > 0 ? (
        <button type="button" className={styles.statusPanelListDisclosure} onClick={() => setShowAll(true)}>{hiddenCount}건 더 보기</button>
      ) : null}
      {staleGroups.length ? (
        <div className={styles.statusPanelStaleGroup}>
          <button type="button" className={styles.statusPanelListDisclosure} onClick={() => setShowStale((current) => !current)} aria-expanded={showStale}>
            {showStale ? <ChevronDown size={13} /> : <ChevronRight size={13} />}14일 지난 것 {stale.length}건 보기
          </button>
          {showStale ? staleGroups.map(renderGroup) : null}
        </div>
      ) : null}
    </>
  );
}

function ConnectionRow({ item }: { item: SystemStatusItem }) {
  return (
    <div className={`${styles.statusPanelConnection} ${item.level === "ok" ? "" : styles.statusPanelConnectionBad}`}>
      {item.level === "ok"
        ? <CheckCircle2 size={14} className={styles.statusPanelIconOk} />
        : <AlertTriangle size={14} className={styles.statusPanelIconBad} />}
      <span>
        <strong>{item.label}</strong>
        <small>{item.state}{item.detail ? ` · ${item.detail}` : ""}</small>
        {item.level !== "ok" && item.remedy ? <em>{item.remedy}</em> : null}
      </span>
    </div>
  );
}

function BrowserJobRow({ job, onOpen }: { job: BackgroundJob; onOpen: (href: string, title: string) => void }) {
  const percent = job.total > 0 ? Math.max(0, Math.min(100, Math.round((job.cur / job.total) * 100))) : 0;
  return (
    <button type="button" className={styles.statusPanelEntry} onClick={() => onOpen(job.returnPath, job.label)}>
      <span className={`${styles.statusPanelSeverity} ${styles.statusPanelSeverity_info}`} aria-hidden="true" />
      <span className={styles.statusPanelEntryText}>
        <strong>{job.label}</strong>
        <small>{job.msg || (job.status === "running" ? "브라우저에서 처리 중입니다." : job.status)}</small>
        <span className={styles.statusPanelProgress} aria-label={`진행률 ${percent}%`}><i style={{ width: `${percent}%` }} /></span>
      </span>
      <ChevronRight size={14} className={styles.statusPanelEntryArrow} />
    </button>
  );
}

function StatusPanelButtonContent() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<StatusPanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [actionStates, setActionStates] = useState<Record<string, EntryActionState>>({});
  const [deferredIssueIds, setDeferredIssueIds] = useState<Set<string>>(() => new Set());
  const [sections, setSections] = useState<StatusPanelSectionState>(DEFAULT_STATUS_PANEL_SECTIONS);
  const [showAllProgress, setShowAllProgress] = useState(false);
  const [selectedRemoteProgress, setSelectedRemoteProgress] = useState<StatusPanelEntry | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const recheckedIssueIdsRef = useRef(new Set<string>());
  const recheckTimersRef = useRef<number[]>([]);
  const autoActionIdsRef = useRef(new Set<string>());
  const { shootingProgress, refresh: refreshPhotoProjects } = usePhotoProjectNotifications();
  const backgroundJobMap = useBackgroundJobsStore((state) => state.jobs);
  const backgroundJobs = useMemo(() => Object.values(backgroundJobMap), [backgroundJobMap]);
  const launchHref = useDesktopAppLauncher();
  const hasActiveRemotePhotoProgress = Boolean(data?.progress.some((entry) => entry.kind === "remote_job_progress" && entry.remoteJob && ["QUEUED", "RUNNING"].includes(entry.remoteJob.status)));

  const load = useCallback(async () => {
    const requestSequence = ++requestSequenceRef.current;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(!hasLoadedRef.current);
    try {
      const response = await fetch("/api/olivia-os/status-panel", { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !body.ok) throw new Error("상태를 불러오지 못했습니다.");
      if (requestSequence !== requestSequenceRef.current) return;
      setData(normalizeStatusPanelData(body));
      setError(false);
      hasLoadedRef.current = true;
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (requestSequence === requestSequenceRef.current) setError(true);
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setLoading(false);
        requestControllerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    setSections(parseStoredSectionState(window.localStorage.getItem(STATUS_PANEL_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    void load();
    const pollInterval = hasActiveRemotePhotoProgress ? ACTIVE_PHOTO_POLL_MS : open ? OPEN_POLL_MS : CLOSED_POLL_MS;
    const timer = window.setInterval(() => void load(), pollInterval);
    return () => window.clearInterval(timer);
  }, [open, load, hasActiveRemotePhotoProgress]);

  useEffect(() => () => {
    requestControllerRef.current?.abort();
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
        className={styles.topBarIconButton}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={effectiveBadge.count ? `시스템 상태, 확인 ${effectiveBadge.count}건` : "시스템 상태"}
        onClick={() => setOpen((current) => !current)}
      >
        <Server size={15} />
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
                  <CompactedEntryList
                    entries={issues}
                    empty={null}
                    onOpen={openEntry}
                    onAction={executeAction}
                    actionStates={actionStates}
                  />
                </div>
              </section>
            ) : null}

            <PanelSection
              icon={<UserRoundCheck size={14} />}
              label="내 차례"
              count={data.myTurn.length}
              open={sections.myTurn}
              onToggle={() => toggleSection("myTurn")}
            >
              <CompactedEntryList
                entries={data.myTurn}
                empty={<p className={styles.statusPanelEmpty}>지금 직접 확인할 항목이 없습니다.</p>}
                onOpen={openEntry}
                onAction={executeAction}
                actionStates={actionStates}
              />
            </PanelSection>

            <PanelSection
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
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onOpen={openEntry}
                  onAction={executeAction}
                  actionStates={actionStates}
                />
              ))}
              {displayedBackgroundJobs.map((job) => <BrowserJobRow key={job.id} job={job} onOpen={(href, title) => { launchHref(href, title); setOpen(false); }} />)}
              {!showAllProgress && hiddenProgressCount > 0 ? (
                <button type="button" className={styles.statusPanelListDisclosure} onClick={() => setShowAllProgress(true)}>{hiddenProgressCount}건 더 보기</button>
              ) : null}
              {progressCount === 0 ? <p className={styles.statusPanelEmpty}>현재 진행 중인 작업이 없습니다.</p> : null}
            </PanelSection>

            <PanelSection
              icon={<Server size={14} />}
              label="연결 상태"
              summary={connectionProblem ? `${connectionItems.filter((item) => item.level !== "ok").length}개 확인` : "모두 정상 ✓"}
              open={sections.connections}
              onToggle={() => toggleSection("connections")}
            >
              {connectionItems.map((item) => <ConnectionRow key={item.id} item={item} />)}
            </PanelSection>

            <PanelSection
              icon={<History size={14} />}
              label="최근 기록"
              count={data.recentActivity.length}
              open={sections.recent}
              onToggle={() => toggleSection("recent")}
            >
              <CompactedEntryList
                entries={data.recentActivity}
                empty={<p className={styles.statusPanelEmpty}>최근 기록이 없습니다.</p>}
                onOpen={openEntry}
                onAction={executeAction}
                actionStates={actionStates}
              />
              <div className={styles.statusPanelCheckedAt}><Clock3 size={11} />{relativeTime(data.checkedAt)} 확인</div>
            </PanelSection>
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
