"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  FolderOpen,
  History,
  House,
  Images,
  LayoutGrid,
  Maximize,
  SlidersHorizontal,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import { useOliviaDesktopStore, type WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import { getOliviaApp } from "./registry/oliviaAppRegistry";
import type { ShellSelection, ShellSelectionEventDetail } from "@/lib/olivia/desktop/shellSelection";
import type { StatusPanelData, StatusPanelEntry } from "@/lib/system-status/panelTypes";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import styles from "./OliviaDesktop.module.css";

type CasePayload = {
  ok?: boolean;
  client?: { id?: string; name?: string; hospital_name?: string; department?: string };
  workflowRun?: { id?: string; project_name?: string; current_step_key?: string; status?: string };
  workflowCheckProgress?: { done?: number; total?: number } | null;
  resourceIds?: { quote?: string | null; conti?: string | null };
};

type Gallery = { id: string; title?: string | null; workflow_run_id?: string | null };
type ShellTab = {
  key: string;
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  href?: string;
  context?: WindowContext;
};

const CASE_APPS = new Set(["quote", "conti", "select-galleries"]);
const DEDICATED_INSPECTOR_APPS = new Set(["olivia-bridge"]);
const APP_LABELS: Record<string, string> = {
  home: "홈",
  customer: "고객관리",
  calendar: "일정",
  "olivia-bridge": "Olivia Bridge",
  "video-studio": "영상작업실",
  quote: "견적서",
  conti: "촬영 콘티",
  "select-galleries": "사진 셀렉",
  "work-journal": "업무일지",
  "all-apps": "모든 앱",
};
const PANEL_LABELS: Record<string, string> = {
  home: "작업 정보",
  customer: "고객 정보",
  calendar: "일정 정보",
  "olivia-bridge": "사진 정보",
  "video-studio": "작업 정보",
  quote: "항목 편집",
  conti: "장면 편집",
  "select-galleries": "사진 정보",
  "work-journal": "기록 정보",
  "all-apps": "앱 정보",
};

function todayLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  }).format(new Date()).replace(/\. /g, ".").replace(/\.$/, "");
}

export function DesktopCaseChrome({ appId, context, children }: { appId: string; context?: WindowContext; children: ReactNode }) {
  const launchHref = useDesktopAppLauncher();
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const [detail, setDetail] = useState<CasePayload | null>(null);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [caseLoadState, setCaseLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [panelOpen, setPanelOpen] = useState(!DEDICATED_INSPECTOR_APPS.has(appId));
  const [panelTab, setPanelTab] = useState<"info" | "olivia">("info");
  const [focusMode, setFocusMode] = useState(false);
  const [localTab, setLocalTab] = useState(appId === "home" ? "home" : appId);
  const [selection, setSelection] = useState<ShellSelection | null>(null);
  const selectedEntityId = useOliviaContextStore((state) => state.selectedEntityId);
  const selectedEntityType = useOliviaContextStore((state) => state.selectedEntityType);
  const clientId = context?.clientId;
  const workflowRunId = context?.workflowRunId ?? context?.projectId;
  const caseEnabled = Boolean(clientId && workflowRunId && CASE_APPS.has(appId));

  useEffect(() => {
    if (!caseEnabled || !clientId || !workflowRunId) {
      setDetail(null);
      setGalleries([]);
      setCaseLoadState("idle");
      return;
    }
    let active = true;
    setDetail(null);
    setGalleries([]);
    setCaseLoadState("loading");
    Promise.all([
      fetch(`/api/clients/${encodeURIComponent(clientId)}?workflowRunId=${encodeURIComponent(workflowRunId)}`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/select-galleries?workflowRunId=${encodeURIComponent(workflowRunId)}`, { cache: "no-store" }).then((response) => response.json()),
    ]).then(([clientPayload, galleryPayload]) => {
      if (!active) return;
      const clientMatches = !clientPayload?.client?.id || clientPayload.client.id === clientId;
      const runMatches = !clientPayload?.workflowRun?.id || clientPayload.workflowRun.id === workflowRunId;
      if (!clientPayload?.ok || !clientMatches || !runMatches) {
        setCaseLoadState("error");
        return;
      }
      setDetail(clientPayload);
      const ownedGalleries = (galleryPayload?.ok ? galleryPayload.galleries ?? [] : [])
        .filter((gallery: Gallery) => !gallery.workflow_run_id || gallery.workflow_run_id === workflowRunId);
      setGalleries(ownedGalleries);
      setCaseLoadState("ready");
    }).catch(() => { if (active) setCaseLoadState("error"); });
    return () => { active = false; };
  }, [caseEnabled, clientId, workflowRunId]);

  useEffect(() => {
    setPanelOpen(!DEDICATED_INSPECTOR_APPS.has(appId));
    setPanelTab("info");
    setFocusMode(false);
    setLocalTab(appId === "home" ? "home" : appId);
    setSelection(null);
  }, [appId, clientId, workflowRunId]);

  useEffect(() => {
    const updateSelection = (event: Event) => {
      const next = (event as CustomEvent<ShellSelectionEventDetail>).detail;
      const expectedWindowId = appId === "home" ? "home" : appId;
      if (!next || next.sourceAppId !== appId || next.sourceWindowId !== expectedWindowId) return;
      if ("clear" in next && next.clear) setSelection(null);
      else if (next.title) setSelection(next);
    };
    window.addEventListener("olivia-shell-selection", updateSelection);
    return () => window.removeEventListener("olivia-shell-selection", updateSelection);
  }, [appId]);

  useEffect(() => {
    const matchesQuote = appId === "quote" && selectedEntityType === "quote-item";
    const matchesConti = appId === "conti" && selectedEntityType === "conti-shot";
    if (!selectedEntityId || (!matchesQuote && !matchesConti)) return;
    setSelection({
      sourceAppId: appId,
      sourceWindowId: appId,
      itemId: selectedEntityId,
      title: matchesQuote ? "선택한 견적 항목" : "선택한 콘티 장면",
      subtitle: selectedEntityId,
      next: matchesQuote ? "선택 항목의 수량과 금액을 편집합니다." : "선택 장면의 촬영 내용을 편집합니다.",
      appId,
      context: { ...context, featureItemId: selectedEntityId },
      featureItemId: selectedEntityId,
    });
  }, [appId, context, selectedEntityId, selectedEntityType]);

  useEffect(() => {
    if (appId !== "calendar") return;
    const syncView = (event: Event) => {
      const viewMode = (event as CustomEvent<{ viewMode?: string }>).detail?.viewMode;
      if (viewMode === "month") setLocalTab("calendar");
      if (viewMode === "week") setLocalTab("calendar-week");
    };
    window.addEventListener("olivia-calendar-view-mode", syncView);
    return () => window.removeEventListener("olivia-calendar-view-mode", syncView);
  }, [appId]);

  const clientName = detail?.client?.name ?? detail?.client?.hospital_name ?? context?.clientName;
  const run = detail?.workflowRun;
  const progress = detail?.workflowCheckProgress;

  const tabs = useMemo<ShellTab[]>(() => {
    if (appId === "home") return [
      { key: "home", label: "홈", subtitle: "오늘 · 이어할 작업", icon: House },
      { key: "recent", label: "최근 작업", subtitle: "열어 둔 문서와 촬영건", icon: History },
    ];
    if (appId === "calendar") return [
      { key: "calendar", label: "월간 일정", subtitle: new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long" }).format(new Date()), icon: CalendarDays },
      { key: "calendar-week", label: "주간 일정", subtitle: "이번 주", icon: History },
    ];
    if (appId === "customer") {
      const result: ShellTab[] = [{ key: "customer", label: "고객관리", subtitle: "전체 촬영건", icon: UsersRound }];
      if (context?.clientName) result.push({ key: "customer-selected", label: context.clientName, subtitle: context.projectName ?? "선택한 촬영건", icon: FolderOpen });
      return result;
    }
    if (caseEnabled && clientId && workflowRunId) {
      const base = { clientId, clientName, workflowRunId, projectId: workflowRunId };
      const result: ShellTab[] = [];
      const quoteId = detail?.resourceIds?.quote ?? (appId === "quote" ? context?.resourceId : null);
      if (quoteId || appId === "quote") result.push({ key: "quote", label: "견적서", subtitle: clientName, icon: FileText, href: "/quote", context: { ...base, resourceId: quoteId ?? undefined, documentType: "quote" } });
      const contiId = detail?.resourceIds?.conti ?? (appId === "conti" ? context?.resourceId : null);
      if (contiId || appId === "conti") result.push({ key: "conti", label: "촬영 콘티", subtitle: clientName, icon: LayoutGrid, href: "/conti", context: { ...base, resourceId: contiId ?? undefined, documentType: "conti" } });
      const gallery = galleries[0] ?? (appId === "select-galleries" && context?.resourceId ? { id: context.resourceId } : null);
      if (gallery || appId === "select-galleries") result.push({ key: "select-galleries", label: "사진 셀렉", subtitle: gallery?.title ?? clientName, icon: Images, href: gallery ? `/select-galleries/${gallery.id}` : "/select-galleries", context: { ...base, resourceId: gallery?.id, routeHref: gallery ? `/select-galleries/${gallery.id}` : "/select-galleries" } });
      return result;
    }
    return [{ key: appId, label: APP_LABELS[appId] ?? appId, subtitle: context?.projectName ?? context?.documentTitle, icon: appId === "olivia-bridge" || appId === "video-studio" ? Images : FileText }];
  }, [appId, caseEnabled, clientId, clientName, context?.clientName, context?.documentTitle, context?.projectName, context?.resourceId, detail, galleries, workflowRunId]);

  const handleTab = (tab: ShellTab) => {
    setLocalTab(tab.key);
    if (tab.href && tab.context) {
      launchHref(tab.href, clientName ?? tab.label, tab.context);
      return;
    }
    window.dispatchEvent(new CustomEvent("olivia-shell-tab", { detail: { appId, tab: tab.key } }));
  };

  const openSelection = () => {
    if (!selection) return;
    const selectionContext: WindowContext = {
      ...selection.context,
      clientId: selection.context?.clientId ?? context?.clientId,
      workflowRunId: selection.context?.workflowRunId ?? context?.workflowRunId ?? context?.projectId,
      projectId: selection.context?.projectId ?? context?.projectId ?? context?.workflowRunId,
      featureItemId: selection.featureItemId ?? selection.itemId,
    };
    if (selection.href) {
      launchHref(selection.href, selection.title, selectionContext);
      return;
    }
    if (!selection.appId) return;
    const app = getOliviaApp(selection.appId);
    if (!app) return;
    openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height, context: selectionContext });
  };

  const appLabel = APP_LABELS[appId] ?? appId;
  const contextTitle = selection?.title ?? clientName ?? appLabel;
  const contextSubtitle = selection?.subtitle ?? run?.project_name ?? context?.projectName ?? context?.documentTitle ?? (appId === "home" ? todayLabel() : "현재 작업");
  const currentChildren = appId === "home" && localTab === "recent"
    ? <div className={styles.recentWorkspace}><DesktopRecentNotice /></div>
    : children;

  return (
    <div className={styles.caseChrome} data-panel-open={panelOpen && !focusMode} data-focus={focusMode} data-has-tabs={tabs.length > 1}>
      <section className={styles.caseChromeStage}>
        {tabs.length > 1 ? (
          <nav className={styles.caseTabs} role="tablist" aria-label={`${appLabel} 보기`}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = caseEnabled ? appId === tab.key : localTab === tab.key;
              return (
                <button key={tab.key} type="button" role="tab" aria-selected={active} onClick={() => handleTab(tab)}>
                  <Icon size={17} strokeWidth={1.75} />
                  <span><strong>{tab.label}</strong>{tab.subtitle ? <small>{tab.subtitle}</small> : null}</span>
                </button>
              );
            })}
          </nav>
        ) : null}
        <div className={styles.caseContextBar}>
          <div><strong>{contextTitle}</strong><span aria-hidden="true">›</span><small>{contextSubtitle}</small></div>
          <div className={styles.caseContextActions}>
            <button type="button" data-active={panelOpen && !focusMode} onClick={() => {
              if (DEDICATED_INSPECTOR_APPS.has(appId)) {
                window.dispatchEvent(new CustomEvent("olivia-bridge-open-inspector"));
                return;
              }
              setFocusMode(false);
              setPanelOpen((value) => !value);
            }} aria-pressed={panelOpen && !focusMode}>
              <SlidersHorizontal size={15} /> {PANEL_LABELS[appId] ?? "작업 정보"}
            </button>
            <button type="button" data-active={focusMode} onClick={() => { setFocusMode((value) => !value); setPanelOpen(false); }} aria-pressed={focusMode}>
              <Maximize size={15} /> 집중 보기
            </button>
          </div>
        </div>
        <div className={styles.caseChromeContent}>{currentChildren}</div>
        <footer className={styles.caseStatusBar}>
          <span>{selection ? `선택한 작업 · ${selection.title}` : `${appLabel} · ${contextSubtitle}`}</span>
          <span>고객·일정·작업 상태는 Olivia와 연결됩니다</span>
        </footer>
      </section>
      {panelOpen && !focusMode ? (
        <aside className={styles.caseSidePanel}>
          <header className={styles.casePanelHeader}><strong>{PANEL_LABELS[appId] ?? "작업 정보"}</strong><button type="button" onClick={() => setPanelOpen(false)} aria-label="패널 닫기"><X size={16} /></button></header>
          <div className={styles.casePanelTabs} role="tablist" aria-label="오른쪽 패널">
            <button type="button" role="tab" aria-selected={panelTab === "info"} onClick={() => setPanelTab("info")}>작업 정보</button>
            <button type="button" role="tab" aria-selected={panelTab === "olivia"} onClick={() => setPanelTab("olivia")}>Olivia</button>
          </div>
          {panelTab === "info" ? (
            <div className={styles.casePanelInfo}>
              <section>
                <span>{clientName ?? appLabel}</span>
                <strong>{selection?.title ?? contextTitle}</strong>
                <small>{selection?.subtitle ?? contextSubtitle}</small>
                {selection?.href || selection?.appId ? (
                  <div className={styles.casePanelActions}>
                    <button
                      type="button"
                      className={styles.casePanelPrimary}
                      onClick={openSelection}
                    >
                      <ArrowUpRight size={14} /> 이어 열기
                    </button>
                  </div>
                ) : null}
              </section>
              <dl>
                <div><dt>현재 상태</dt><dd>{caseLoadState === "loading" ? "불러오는 중" : caseLoadState === "error" ? "정보를 불러오지 못함" : run?.status === "completed" ? "완료" : run ? "진행 중" : "선택 정보"}</dd></div>
                {progress ? <div><dt>진행</dt><dd>{progress.done ?? 0} / {progress.total ?? 18} 완료</dd></div> : null}
                <div><dt>연결 자료</dt><dd>{tabs.map((tab) => tab.label).join(" · ")}</dd></div>
              </dl>
              <div className={styles.casePanelNext}><span>다음에 확인할 내용</span><p>{selection?.next ?? "현재 작업과 연결된 자료를 확인합니다."}</p></div>
              <p>고객과 촬영건을 유지한 채 이어서 작업합니다.</p>
            </div>
          ) : <OliviaChatDockTarget id={`desktop-case-${workflowRunId ?? appId}`} priority={90} className={styles.casePanelChat} />}
        </aside>
      ) : null}
    </div>
  );
}

function DesktopRecentNotice() {
  const launchHref = useDesktopAppLauncher();
  const [entries, setEntries] = useState<StatusPanelEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/olivia-os/status-panel", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: StatusPanelData & { ok?: boolean }) => {
        if (!active) return;
        if (!payload?.ok) throw new Error("status panel");
        const seen = new Set<string>();
        setEntries((payload.recentActivity ?? []).filter((entry) => {
          if (!entry.href || seen.has(entry.href)) return false;
          seen.add(entry.href);
          return true;
        }).slice(0, 8));
        setState("ready");
      })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  if (state === "loading") return <div><History size={20} /><strong>최근 작업을 불러오는 중입니다</strong></div>;
  if (state === "error") return <div><History size={20} /><strong>최근 작업을 불러오지 못했습니다</strong><p>홈의 이어할 작업에서 다시 확인할 수 있습니다.</p></div>;
  if (!entries.length) return <div><History size={20} /><strong>최근 작업이 없습니다</strong></div>;
  return <div><History size={20} /><strong>최근 작업</strong><div>{entries.map((entry) => <button key={entry.id} type="button" onClick={() => entry.href && launchHref(entry.href, entry.title, { clientId: entry.clientId ?? undefined, workflowRunId: entry.workflowRunId ?? undefined, projectId: entry.workflowRunId ?? undefined, featureItemId: entry.id })}><span><b>{entry.title}</b><small>{entry.detail}</small></span><ArrowUpRight size={14} /></button>)}</div></div>;
}
