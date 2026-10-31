"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText, Images, LayoutPanelTop, MessageCircle, PanelRightClose, PanelRightOpen } from "lucide-react";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import styles from "./OliviaDesktop.module.css";

type CasePayload = {
  ok?: boolean;
  client?: { id?: string; name?: string; hospital_name?: string; department?: string };
  workflowRun?: { id?: string; project_name?: string; current_step_key?: string; status?: string };
  workflowCheckProgress?: { done?: number; total?: number } | null;
  resourceIds?: { quote?: string | null; conti?: string | null };
};

type Gallery = { id: string; title?: string | null };
type CaseTab = { key: string; label: string; icon: typeof FileText; href: string; context: WindowContext };

const CASE_APPS = new Set(["quote", "conti", "select-galleries"]);

export function DesktopCaseChrome({ appId, context, children }: { appId: string; context?: WindowContext; children: ReactNode }) {
  const launchHref = useDesktopAppLauncher();
  const [detail, setDetail] = useState<CasePayload | null>(null);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"info" | "olivia">("info");
  const clientId = context?.clientId;
  const workflowRunId = context?.workflowRunId ?? context?.projectId;
  const enabled = Boolean(clientId && workflowRunId && CASE_APPS.has(appId));

  useEffect(() => {
    if (!enabled || !clientId || !workflowRunId) return;
    let active = true;
    Promise.all([
      fetch(`/api/clients/${encodeURIComponent(clientId)}?workflowRunId=${encodeURIComponent(workflowRunId)}`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/select-galleries?workflowRunId=${encodeURIComponent(workflowRunId)}`, { cache: "no-store" }).then((response) => response.json()),
    ]).then(([clientPayload, galleryPayload]) => {
      if (!active) return;
      if (clientPayload?.ok) setDetail(clientPayload);
      if (galleryPayload?.ok) setGalleries(galleryPayload.galleries ?? []);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [clientId, enabled, workflowRunId]);

  useEffect(() => {
    setPanelOpen(false);
    setPanelTab("info");
  }, [appId, clientId, workflowRunId]);

  const tabs = useMemo<CaseTab[]>(() => {
    if (!enabled || !clientId || !workflowRunId) return [];
    const base = { clientId, clientName: detail?.client?.name ?? detail?.client?.hospital_name, workflowRunId, projectId: workflowRunId };
    const result: CaseTab[] = [];
    const quoteId = detail?.resourceIds?.quote ?? (appId === "quote" ? context?.resourceId : null);
    if (quoteId || appId === "quote") result.push({ key: "quote", label: "견적서", icon: FileText, href: "/quote", context: { ...base, resourceId: quoteId ?? undefined, documentType: "quote" } });
    const contiId = detail?.resourceIds?.conti ?? (appId === "conti" ? context?.resourceId : null);
    if (contiId || appId === "conti") result.push({ key: "conti", label: "촬영 콘티", icon: LayoutPanelTop, href: "/conti", context: { ...base, resourceId: contiId ?? undefined, documentType: "conti" } });
    const gallery = galleries[0] ?? (appId === "select-galleries" && context?.resourceId ? { id: context.resourceId } : null);
    if (gallery || appId === "select-galleries") result.push({ key: "select-galleries", label: "사진 셀렉", icon: Images, href: gallery ? `/select-galleries/${gallery.id}` : "/select-galleries", context: { ...base, resourceId: gallery?.id, routeHref: gallery ? `/select-galleries/${gallery.id}` : "/select-galleries" } });
    return result;
  }, [appId, clientId, context?.resourceId, detail, enabled, galleries, workflowRunId]);

  if (!enabled) return <>{children}</>;
  const clientName = detail?.client?.name ?? detail?.client?.hospital_name ?? context?.clientName ?? "고객 작업";
  const run = detail?.workflowRun;
  const progress = detail?.workflowCheckProgress;

  return (
    <div className={styles.caseChrome} data-panel-open={panelOpen}>
      <section className={styles.caseChromeStage}>
        {tabs.length > 1 ? (
          <nav className={styles.caseTabs} aria-label={`${clientName} 문서`}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return <button key={tab.key} type="button" data-active={appId === tab.key} onClick={() => launchHref(tab.href, clientName, tab.context)}><Icon size={15} />{tab.label}</button>;
            })}
          </nav>
        ) : null}
        <div className={styles.caseContextBar}>
          <div><strong>{clientName}</strong><span>{run?.project_name || context?.projectName || "촬영 건"}</span></div>
          <button type="button" onClick={() => setPanelOpen((value) => !value)} aria-expanded={panelOpen}>
            {panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />} 작업 정보
          </button>
        </div>
        <div className={styles.caseChromeContent}>{children}</div>
      </section>
      {panelOpen ? (
        <aside className={styles.caseSidePanel}>
          <div className={styles.casePanelTabs} role="tablist" aria-label="오른쪽 패널">
            <button type="button" role="tab" aria-selected={panelTab === "info"} onClick={() => setPanelTab("info")}>작업 정보</button>
            <button type="button" role="tab" aria-selected={panelTab === "olivia"} onClick={() => setPanelTab("olivia")}><MessageCircle size={14} /> Olivia</button>
          </div>
          {panelTab === "info" ? (
            <div className={styles.casePanelInfo}>
              <section><span>현재 작업</span><strong>{clientName}</strong><small>{run?.project_name || "촬영 건"}</small></section>
              <section><span>진행 상태</span><strong>{run?.status === "completed" ? "완료" : "진행 중"}</strong><small>{progress ? `${progress.done ?? 0} / ${progress.total ?? 18} 완료` : run?.current_step_key || "상태 확인 중"}</small></section>
              <section><span>연결 자료</span><ul>{tabs.map((tab) => <li key={tab.key}>{tab.label}</li>)}</ul></section>
              <p>문서를 바꿔도 같은 촬영 건의 맥락을 유지합니다.</p>
            </div>
          ) : <OliviaChatDockTarget id={`desktop-case-${workflowRunId}`} priority={90} className={styles.casePanelChat} />}
        </aside>
      ) : null}
    </div>
  );
}
