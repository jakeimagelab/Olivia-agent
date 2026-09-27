"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  History,
  RefreshCw,
  Server,
  UserRoundCheck,
} from "lucide-react";
import { usePhotoProjectNotifications } from "@/components/photo-storage/PhotoProjectNotificationProvider";
import { ShootingProgressCards } from "@/components/shooting-progress/ShootingProgressCards";
import {
  connectionStatusItems,
  DEFAULT_STATUS_PANEL_SECTIONS,
  hasConnectionProblem,
  parseStoredSectionState,
  STATUS_PANEL_STORAGE_KEY,
  statusPanelBadge,
  systemAttentionItems,
  type StatusPanelSectionKey,
  type StatusPanelSectionState,
} from "@/lib/system-status/panelModel";
import type { StatusPanelData, StatusPanelEntry, StatusPanelRecentEntry } from "@/lib/system-status/panelTypes";
import type { SystemStatusItem } from "@/lib/system-status/types";
import { useBackgroundJobsStore, type BackgroundJob } from "@/lib/store/useBackgroundJobsStore";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import styles from "./OliviaDesktop.module.css";

const CLOSED_POLL_MS = 60_000;
const OPEN_POLL_MS = 25_000;

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

function EntryRow({ entry, onOpen }: { entry: StatusPanelEntry; onOpen: (entry: StatusPanelEntry) => void }) {
  const content = (
    <>
      <span className={`${styles.statusPanelSeverity} ${styles[`statusPanelSeverity_${entry.level}`]}`} aria-hidden="true" />
      <span className={styles.statusPanelEntryText}>
        <strong>{entry.title}</strong>
        {entry.detail ? <small>{entry.detail}</small> : null}
        {typeof entry.progressPercent === "number" ? (
          <span className={styles.statusPanelProgress} aria-label={`진행률 ${entry.progressPercent}%`}>
            <i style={{ width: `${entry.progressPercent}%` }} />
          </span>
        ) : null}
      </span>
      {entry.href ? <ChevronRight size={14} className={styles.statusPanelEntryArrow} /> : null}
    </>
  );
  return entry.href ? (
    <button type="button" className={styles.statusPanelEntry} onClick={() => onOpen(entry)}>{content}</button>
  ) : (
    <div className={styles.statusPanelEntry}>{content}</div>
  );
}

function RecentRow({ entry, onOpen }: { entry: StatusPanelRecentEntry; onOpen: (entry: StatusPanelRecentEntry) => void }) {
  return (
    <button type="button" className={styles.statusPanelEntry} onClick={() => onOpen(entry)}>
      <span className={`${styles.statusPanelSeverity} ${styles[`statusPanelSeverity_${entry.level}`]}`} aria-hidden="true" />
      <span className={styles.statusPanelEntryText}>
        <strong>{entry.title}</strong>
        <small>{entry.detail} · {relativeTime(entry.createdAt)}</small>
      </span>
      <ChevronRight size={14} className={styles.statusPanelEntryArrow} />
    </button>
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

export function StatusPanelButton() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<StatusPanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [sections, setSections] = useState<StatusPanelSectionState>(DEFAULT_STATUS_PANEL_SECTIONS);
  const panelRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const { shootingProgress, refresh: refreshPhotoProjects } = usePhotoProjectNotifications();
  const backgroundJobMap = useBackgroundJobsStore((state) => state.jobs);
  const backgroundJobs = useMemo(() => Object.values(backgroundJobMap), [backgroundJobMap]);
  const launchHref = useDesktopAppLauncher();

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
      setData(body as StatusPanelData);
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
    const timer = window.setInterval(() => void load(), open ? OPEN_POLL_MS : CLOSED_POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, load]);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

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

  const issues = useMemo(() => data ? systemAttentionItems(data) : [], [data]);
  const badge = statusPanelBadge({ issues, myTurnCount: data?.myTurn.length ?? 0 });
  const effectiveBadge = error && !data ? { tone: "orange" as const, count: 1 } : badge;
  const visibleShootingProgress = shootingProgress.filter((card) => !card.actionRequired);
  const shootingProjectIds = new Set(visibleShootingProgress.map((card) => card.projectId));
  const serverProgress = (data?.progress ?? []).filter((entry) => !entry.projectId || !shootingProjectIds.has(entry.projectId));
  const progressCount = visibleShootingProgress.length + serverProgress.length + backgroundJobs.length;

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

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), refreshPhotoProjects()]);
  }, [load, refreshPhotoProjects]);

  return (
    <div className={styles.statusPanelGroup} ref={panelRef}>
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
            {issues.length ? (
              <section className={`${styles.statusPanelSection} ${styles.statusPanelUrgent}`} aria-label="지금 확인할 것">
                <div className={styles.statusPanelUrgentTitle}>
                  <span><AlertTriangle size={14} />지금 확인할 것</span>
                  <b>{issues.length}</b>
                </div>
                <div className={styles.statusPanelSectionBody}>
                  {issues.map((entry) => <EntryRow key={entry.id} entry={entry} onOpen={openEntry} />)}
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
              {data.myTurn.length
                ? data.myTurn.map((entry) => <EntryRow key={entry.id} entry={entry} onOpen={openEntry} />)
                : <p className={styles.statusPanelEmpty}>지금 직접 확인할 항목이 없습니다.</p>}
            </PanelSection>

            <PanelSection
              icon={<Activity size={14} />}
              label="진행 중"
              count={progressCount}
              open={sections.progress}
              onToggle={() => toggleSection("progress")}
            >
              {visibleShootingProgress.length ? (
                <div className={styles.statusPanelWorkSection}>
                  <ShootingProgressCards
                    cards={visibleShootingProgress}
                    variant="panel"
                    onUpdated={refreshPhotoProjects}
                    onOpenFolder={(card) => launchHref(`/remote-files?path=${encodeURIComponent(card.sourceRelativePath)}`, card.projectName)}
                    onOpenClient={(clientId) => launchHref(`/clients?clientId=${encodeURIComponent(clientId)}`, undefined, { clientId })}
                  />
                </div>
              ) : null}
              {serverProgress.map((entry) => <EntryRow key={entry.id} entry={entry} onOpen={openEntry} />)}
              {backgroundJobs.map((job) => <BrowserJobRow key={job.id} job={job} onOpen={(href, title) => { launchHref(href, title); setOpen(false); }} />)}
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
              {data.recentActivity.length
                ? data.recentActivity.map((entry) => <RecentRow key={entry.id} entry={entry} onOpen={openEntry} />)
                : <p className={styles.statusPanelEmpty}>최근 기록이 없습니다.</p>}
              <div className={styles.statusPanelCheckedAt}><Clock3 size={11} />{relativeTime(data.checkedAt)} 확인</div>
            </PanelSection>
          </>
        )}
      </div>
    </div>
  );
}
