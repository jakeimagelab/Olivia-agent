"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, FileText, Images, LayoutPanelTop, LoaderCircle } from "lucide-react";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";
import type { StatusPanelData, StatusPanelEntry } from "@/lib/system-status/panelTypes";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import styles from "./OliviaDesktop.module.css";

type HomeFilter = "all" | "document" | "media";

function dateHeading() {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(new Date());
}

function relativeTime(value?: string | null) {
  if (!value) return "최근";
  const days = Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

function entryKind(entry: StatusPanelEntry): Exclude<HomeFilter, "all"> {
  const value = `${entry.kind} ${entry.href ?? ""}`.toLowerCase();
  return /(photo|bridge|gallery|select|video|sorting|raw)/.test(value) ? "media" : "document";
}

function EntryIcon({ entry }: { entry: StatusPanelEntry }) {
  if (entryKind(entry) === "media") return <Images size={17} />;
  if (/conti/.test(`${entry.kind} ${entry.href ?? ""}`)) return <LayoutPanelTop size={17} />;
  return <FileText size={17} />;
}

export function DesktopWidgets({ windowMode = false }: { windowMode?: boolean }) {
  const { data, state } = useHomeDashboardData();
  const launchHref = useDesktopAppLauncher();
  const [panel, setPanel] = useState<StatusPanelData | null>(null);
  const [panelLoaded, setPanelLoaded] = useState(false);
  const [filter, setFilter] = useState<HomeFilter>("all");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/olivia-os/status-panel", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => { if (active && payload?.ok) setPanel(payload as StatusPanelData); })
      .catch(() => undefined)
      .finally(() => { if (active) setPanelLoaded(true); });
    return () => { active = false; };
  }, []);

  const continueEntries = useMemo(() => {
    const merged = [...(panel?.myTurn ?? []), ...(panel?.recentActivity ?? [])];
    const seen = new Set<string>();
    return merged.filter((entry) => {
      if (!entry.href || seen.has(entry.href)) return false;
      seen.add(entry.href);
      return filter === "all" || entryKind(entry) === filter;
    }).slice(0, 4);
  }, [filter, panel]);
  const confirmations = panel?.myTurn.slice(0, 3) ?? [];
  const schedule = data?.todayTasks.slice(0, 3) ?? [];
  const loading = state === "loading" && !panel;
  const selectedEntry = continueEntries.find((entry) => entry.id === selectedEntryId) ?? continueEntries[0] ?? null;

  useEffect(() => {
    if (!selectedEntry) return;
    window.dispatchEvent(new CustomEvent("olivia-shell-selection", {
      detail: {
        title: selectedEntry.title,
        subtitle: selectedEntry.detail || "이어서 확인하세요",
        next: selectedEntry.detail || "선택한 작업을 이어서 확인합니다.",
        href: selectedEntry.href,
      },
    }));
  }, [selectedEntry]);

  const openSelected = () => {
    if (!selectedEntry?.href) return;
    launchHref(selectedEntry.href, selectedEntry.title, {
      clientId: selectedEntry.clientId ?? undefined,
      workflowRunId: selectedEntry.workflowRunId ?? undefined,
    });
  };

  return (
    <main className={`${styles.homeWorkspace} ${windowMode ? styles.homeWorkspaceWindow : ""}`}>
      <header className={styles.homeHeading}>
        <div><h1>오늘의 작업</h1><span>{dateHeading()} · 하던 작업을 이어갑니다.</span></div>
        <button type="button" className={styles.homePrimaryAction} disabled={!selectedEntry?.href} onClick={openSelected}>
          <ArrowUpRight size={14} /> 이어 열기
        </button>
      </header>

      <section className={styles.homeContinue} aria-labelledby="home-continue-title">
        <div className={styles.homeSectionHead}>
          <h2 id="home-continue-title">이어할 작업</h2>
          <div className={styles.homeFilters} role="group" aria-label="작업 종류">
            {([['all', '전체'], ['document', '문서'], ['media', '사진·영상']] as const).map(([key, label]) => (
              <button key={key} type="button" data-active={filter === key} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
        </div>
        <div className={styles.homeWorkList}>
          {loading ? <p className={styles.homeEmpty}><LoaderCircle size={16} /> 작업을 불러오는 중이에요</p> : null}
          {!loading && continueEntries.length === 0 ? <p className={styles.homeEmpty}>이어할 작업이 없습니다.</p> : null}
          {continueEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.homeWorkRow}
              data-selected={selectedEntry?.id === entry.id}
              aria-pressed={selectedEntry?.id === entry.id}
              onClick={() => setSelectedEntryId(entry.id)}
              onDoubleClick={() => launchHref(entry.href!, entry.title, { clientId: entry.clientId ?? undefined, workflowRunId: entry.workflowRunId ?? undefined })}
            >
              <span className={styles.homeWorkIcon}><EntryIcon entry={entry} /></span>
              <span className={styles.homeWorkText}><strong>{entry.title}</strong><small>{entry.detail || "이어서 확인하세요"}</small></span>
              <time>{relativeTime(entry.createdAt)}</time><ArrowUpRight className={styles.homeWorkArrow} size={16} />
            </button>
          ))}
        </div>
      </section>

      <div className={styles.homeLowerGrid}>
        <section className={styles.homeSummaryCard}>
          <header><span>오늘 일정</span></header>
          <div>
            {state === "loading" ? <p className={styles.homeEmpty}>일정을 불러오는 중이에요</p> : null}
            {state !== "loading" && schedule.length === 0 ? <p className={styles.homeEmpty}>오늘 예정된 일정이 없습니다.</p> : null}
            {schedule.map((item) => <div className={styles.homeSummaryRow} key={item.id}><time>{item.time?.slice(0, 5) || "종일"}</time><span><strong>{item.title}</strong><small>{item.location || item.category || "일정"}</small></span></div>)}
          </div>
        </section>
        <section className={styles.homeSummaryCard}>
          <header><span>대표님 확인</span></header>
          <div>
            {!panelLoaded ? <p className={styles.homeEmpty}>확인할 내용을 불러오는 중이에요</p> : null}
            {panelLoaded && !panel ? <p className={styles.homeEmpty}>확인할 내용을 불러오지 못했어요.</p> : null}
            {panel && confirmations.length === 0 ? <p className={styles.homeEmpty}>지금 확인할 내용이 없습니다.</p> : null}
            {confirmations.map((entry) => (
              <button key={entry.id} type="button" className={styles.homeSummaryRow} disabled={!entry.href} onClick={() => entry.href && launchHref(entry.href, entry.title)}>
                <span className={styles.homeCheckDot} /><span><strong>{entry.title}</strong><small>{entry.detail || "확인이 필요합니다"}</small></span>{entry.href ? <ArrowUpRight size={14} /> : null}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
