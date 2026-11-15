"use client";

import {
  Component,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Server,
} from "lucide-react";
import RemoteJobProgress from "@/components/photo-workspace/RemoteJobProgress";
import { logOliviaError } from "@/lib/errors/errorDiagnostics";
import {
  groupStatusPanelEntries,
  limitStatusPanelEntryGroups,
  splitStaleStatusPanelEntries,
} from "@/lib/system-status/panelModel";
import type { StatusPanelAction, StatusPanelEntry } from "@/lib/system-status/panelTypes";
import type { SystemStatusItem } from "@/lib/system-status/types";
import type { BackgroundJob } from "@/lib/store/useBackgroundJobsStore";
import styles from "./OliviaDesktop.module.css";

export type StatusPanelEntryActionState = {
  loading?: boolean;
  message?: string;
  error?: boolean;
};

export class StatusPanelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
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

export function relativeStatusTime(value: string | null | undefined) {
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

export function StatusPanelSection({
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

export function StatusPanelEntryRow({
  entry,
  onOpen,
  onAction,
  actionStates,
}: {
  entry: StatusPanelEntry;
  onOpen: (entry: StatusPanelEntry) => void;
  onAction: (entry: StatusPanelEntry, action: StatusPanelAction) => void;
  actionStates: Record<string, StatusPanelEntryActionState>;
}) {
  const content = (
    <>
      <span className={`${styles.statusPanelSeverity} ${styles[`statusPanelSeverity_${entry.level}`]}`} aria-hidden="true" />
      <span className={styles.statusPanelEntryText}>
        <strong>{entry.title}</strong>
        {entry.detail || entry.createdAt ? (
          <small>{entry.detail || "상태 확인"}{entry.createdAt ? ` · ${relativeStatusTime(entry.createdAt)}` : ""}</small>
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
export function CompactedStatusPanelEntryList({
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
  actionStates: Record<string, StatusPanelEntryActionState>;
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
      return entry ? <StatusPanelEntryRow key={entry.id} entry={entry} onOpen={onOpen} onAction={onAction} actionStates={actionStates} /> : null;
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
          <StatusPanelEntryRow key={entry.id} entry={entry} onOpen={onOpen} onAction={onAction} actionStates={actionStates} />
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

export function StatusPanelConnectionRow({ item }: { item: SystemStatusItem }) {
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

export function StatusPanelBrowserJobRow({ job, onOpen }: { job: BackgroundJob; onOpen: (href: string, title: string) => void }) {
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
