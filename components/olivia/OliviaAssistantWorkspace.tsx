"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OliviaActionCard from "@/components/olivia/OliviaActionCard";
import OliviaApprovalSummary from "@/components/olivia/OliviaApprovalSummary";
import OliviaBriefingPanel from "@/components/olivia/OliviaBriefingPanel";
import OliviaInsightCard from "@/components/olivia/OliviaInsightCard";
import OliviaTimeline from "@/components/olivia/OliviaTimeline";
import OliviaMeetingPanel from "@/components/olivia/OliviaMeetingPanel";

const TABS = ["오늘", "긴급", "승인 대기", "고객 반응", "약속", "제안", "브리핑", "실행 기록"] as const;

type OliviaAssistantWorkspaceProps = {
  compact?: boolean;
  collapsedByDefault?: boolean;
};

export default function OliviaAssistantWorkspace({ compact = false, collapsedByDefault = false }: OliviaAssistantWorkspaceProps) {
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const [tab, setTab] = useState<(typeof TABS)[number]>("오늘");
  const [insights, setInsights] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [commitments, setCommitments] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [briefing, setBriefing] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [i, a, c, e, b] = await Promise.all([
      fetch("/api/olivia/insights?limit=100", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/olivia/actions?limit=100", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/olivia/commitments?limit=100", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/olivia/events?limit=100", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/olivia/briefings/latest", { cache: "no-store" }).then((response) => response.json()),
    ]).catch(() => [] as any[]);
    if (i?.ok) setInsights(i.insights ?? []);
    if (a?.ok) setActions(a.actions ?? []);
    if (c?.ok) setCommitments(c.commitments ?? []);
    if (e?.ok) setEvents(e.events ?? []);
    if (b?.ok) setBriefing(b.briefing ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const customerEvents = useMemo(
    () => events.filter((event) => String(event.event_type).startsWith("client.")),
    [events],
  );
  const suggested = useMemo(
    () => actions.filter((action) => ["suggested", "prepared", "approved"].includes(action.status)),
    [actions],
  );
  const urgentCount = useMemo(
    () => insights.filter((item) => Number(item.priority_score) >= 80 && item.status !== "resolved" && item.status !== "dismissed").length,
    [insights],
  );
  const waitingApprovalCount = useMemo(
    () => actions.filter((item) => item.status === "waiting_approval").length,
    [actions],
  );

  const content = (() => {
    if (loading) return <div className="olivia-empty">올리비아가 업무 상태를 확인하고 있습니다.</div>;
    if (tab === "오늘") return <><OliviaMeetingPanel/><OliviaBriefingPanel briefing={briefing}/><div className="olivia-list-grid">{insights.slice(0, 6).map((item) => <OliviaInsightCard key={item.id} insight={item} onChanged={load}/>)}</div></>;
    if (tab === "긴급") return <div className="olivia-list-grid">{insights.filter((item) => item.priority_score >= 80).map((item) => <OliviaInsightCard key={item.id} insight={item} onChanged={load}/>)}</div>;
    if (tab === "승인 대기") return <><OliviaApprovalSummary actions={actions}/><div className="olivia-list-grid">{actions.filter((item) => item.status === "waiting_approval").map((item) => <OliviaActionCard key={item.id} action={item} onChanged={load}/>)}</div></>;
    if (tab === "고객 반응") return <OliviaTimeline items={customerEvents}/>;
    if (tab === "약속") return <div className="olivia-commitment-list">{commitments.map((item) => <article key={item.id}><span>{item.owner_type === "client" ? "고객 약속" : "대표 약속"}</span><strong>{item.commitment}</strong><small>{item.due_at ? new Date(item.due_at).toLocaleString("ko-KR") : "기한 미정"} · {item.status}</small></article>)}</div>;
    if (tab === "제안") return <div className="olivia-list-grid">{suggested.map((item) => <OliviaActionCard key={item.id} action={item} onChanged={load}/>)}</div>;
    if (tab === "브리핑") return <OliviaBriefingPanel briefing={briefing}/>;
    return <OliviaTimeline items={[...events, ...insights, ...actions].sort((x, y) => new Date(y.created_at || y.detected_at || y.occurred_at).getTime() - new Date(x.created_at || x.detected_at || x.occurred_at).getTime()).slice(0, 100)}/>;
  })();

  const runObserver = async () => {
    await fetch("/api/olivia/observer/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "all_active" }),
    });
    await load();
  };

  if (!expanded) {
    return (
      <button
        type="button"
        className="olivia-assistant-collapsed"
        onClick={() => setExpanded(true)}
        aria-expanded="false"
        aria-controls="olivia-assistant"
      >
        <span className="olivia-assistant-collapsed-title">올리비아 비서</span>
        <span className="olivia-assistant-collapsed-badges">
          {urgentCount > 0 ? <span className="badge badge--urgent">긴급 {urgentCount}</span> : null}
          {waitingApprovalCount > 0 ? <span className="badge badge--wait">승인대기 {waitingApprovalCount}</span> : null}
          {urgentCount === 0 && waitingApprovalCount === 0 ? <span className="badge badge--ok">확인할 항목 없음</span> : null}
        </span>
        <span className="olivia-assistant-collapsed-expand">펼쳐보기 <span aria-hidden="true">⌄</span></span>
      </button>
    );
  }

  return (
    <section id="olivia-assistant" className={`olivia-assistant-page olivia-assistant-page--embedded${compact ? " olivia-assistant-page--compact" : ""}`}>
      <header className="olivia-page-heading">
        <div><span>OLIVIA PROACTIVE ASSISTANT</span><h1>올리비아 비서</h1><p>묻기 전에 발견하고, 말하기 전에 준비하고, 승인되면 실행합니다.</p></div>
        <div className="olivia-heading-actions">
          <button onClick={() => void runObserver()}>지금 업무 확인</button>
          {collapsedByDefault ? <button className="olivia-collapse-button" onClick={() => setExpanded(false)}>접기 <span aria-hidden="true">⌃</span></button> : null}
        </div>
      </header>
      <nav className="olivia-tabs" aria-label="올리비아 비서 메뉴">
        {TABS.map((item) => <button key={item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      </nav>
      <section className="olivia-tab-content">{content}</section>
    </section>
  );
}
