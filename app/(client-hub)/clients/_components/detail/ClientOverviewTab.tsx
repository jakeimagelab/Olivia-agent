"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, ChevronRight, FileCheck2, ListTodo, MapPin, StickyNote } from "lucide-react";
import { C, R } from "@/lib/theme";
import { formatArtifactSize, type WorkflowArtifact } from "@/lib/workflowArtifacts";
import PcrmActivityTimeline from "../PcrmActivityTimeline";

const cardStyle: React.CSSProperties = { background: C.white, border: `1px solid ${C.border}`, borderRadius: R.lg, boxShadow: "0 5px 18px rgba(21,88,85,.055)" };
const TYPE_LABEL: Record<string, string> = { quote: "견적서", contract: "계약서", conti: "콘티" };

type Insight = {
  id: string;
  title: string;
  insight_type?: string;
  recommended_due_at?: string | null;
  detected_at?: string;
};

function dueBadge(insight: Insight) {
  const dueRaw = insight.recommended_due_at || insight.detected_at;
  if (!dueRaw) return { label: "확인 필요", tone: "neutral" as const };
  const due = new Date(dueRaw);
  const todayStr = new Date().toISOString().slice(0, 10);
  if (due.toISOString().slice(0, 10) === todayStr) return { label: "오늘", tone: "today" as const };
  return { label: due.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }), tone: "neutral" as const };
}

export default function ClientOverviewTab({ client, workflowRun, artifacts, activities, summary, onRefresh, onNavigateTab }: {
  client: any; workflowRun: any; artifacts: WorkflowArtifact[]; activities: any[];
  summary?: { pendingApprovalCount: number } | null;
  onRefresh: () => void;
  onNavigateTab?: (tab: string) => void;
}) {
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [memoDraft, setMemoDraft] = useState(client.memo || "");
  const [memoEditing, setMemoEditing] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);

  useEffect(() => {
    if (!client?.name) return;
    let cancelled = false;
    (async () => {
      setScheduleLoading(true);
      try {
        const res = await fetch(`/api/admin/pcrm/schedule?hospitalName=${encodeURIComponent(client.name)}`, { cache: "no-store" });
        const d = await res.json();
        if (!cancelled && d.ok) {
          const todayStr = new Date().toISOString().slice(0, 10);
          setUpcoming((d.tasks || []).filter((t: any) => t.date >= todayStr).sort((a: any, b: any) => a.date.localeCompare(b.date)).slice(0, 5));
        }
      } finally {
        if (!cancelled) setScheduleLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [client?.name]);

  useEffect(() => {
    if (!workflowRun?.id) { setInsights([]); return; }
    let cancelled = false;
    fetch(`/api/olivia/insights?workflowRunId=${encodeURIComponent(workflowRun.id)}&limit=10`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => { if (!cancelled && json.ok) setInsights(json.insights ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [workflowRun?.id]);

  const approvalInsights = insights.filter((i) => i.insight_type === "approval_waiting");

  const saveMemo = async () => {
    setMemoSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memo: memoDraft }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "저장 실패");
      setMemoEditing(false);
      onRefresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "메모 저장에 실패했습니다.");
    } finally {
      setMemoSaving(false);
    }
  };

  const nextSchedule = upcoming[0];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="pcrm-overview-grid-v2">
        {/* 다음 해야 할 일 */}
        <section className="pcrm-side-card" style={cardStyle}>
          <header><h2>다음 해야 할 일</h2><b>{insights.length}건</b></header>
          <div className="pcrm-mini-list">
            {insights.length === 0 ? <p className="pcrm-empty-copy">처리할 일이 없습니다.</p> : insights.slice(0, 4).map((item) => {
              const badge = dueBadge(item);
              return (
                <div key={item.id} className="pcrm-mini-list__item">
                  <span className="pcrm-mini-list__icon"><ListTodo size={13} /></span>
                  <span className="pcrm-mini-list__body"><strong>{item.title}</strong></span>
                  <span className="pcrm-mini-list__badge" data-tone={badge.tone}>{badge.label}</span>
                </div>
              );
            })}
          </div>
          <div className="pcrm-mini-list__foot"><Link href="/workflow/approvals">전체 할 일 보기 ›</Link></div>
        </section>

        {/* 최근 문서 */}
        <section className="pcrm-side-card" style={cardStyle}>
          <header><h2>최근 문서</h2></header>
          <div className="pcrm-mini-list">
            {artifacts.length === 0 ? <p className="pcrm-empty-copy">등록된 문서가 없습니다.</p> : artifacts.slice(0, 4).map((doc) => (
              <div key={doc.id} className="pcrm-mini-list__item">
                <span className="pcrm-mini-list__icon"><FileCheck2 size={13} /></span>
                <span className="pcrm-mini-list__body"><strong>{doc.title || doc.file_name}</strong><small>{TYPE_LABEL[doc.document_type] || doc.document_type} · {formatArtifactSize(doc.file_size)}</small></span>
                <span className="pcrm-mini-list__badge" data-tone="neutral">{new Date(doc.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</span>
              </div>
            ))}
          </div>
          <div className="pcrm-mini-list__foot"><button type="button" onClick={() => onNavigateTab?.("documents")}>전체 보기 ›</button></div>
        </section>

        {/* 촬영 일정 */}
        <section className="pcrm-side-card" style={cardStyle}>
          <header><h2>촬영 일정</h2></header>
          {scheduleLoading ? (
            <p className="pcrm-empty-copy">불러오는 중...</p>
          ) : !nextSchedule ? (
            <p className="pcrm-empty-copy">예정된 일정이 없습니다.</p>
          ) : (
            <div className="pcrm-mini-list">
              <div className="pcrm-mini-list__item">
                <span className="pcrm-mini-list__icon"><CalendarClock size={13} /></span>
                <span className="pcrm-mini-list__body">
                  <strong>{nextSchedule.date.slice(5).replace("-", ".")} · {nextSchedule.title}</strong>
                  <small><MapPin size={9} style={{ display: "inline", verticalAlign: -1 }} /> {nextSchedule.location || "장소 미정"}</small>
                </span>
              </div>
            </div>
          )}
          <div className="pcrm-mini-list__foot" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button type="button" onClick={() => onNavigateTab?.("schedule")}><CalendarPlus size={12} style={{ display: "inline", verticalAlign: -2 }} /> 일정 추가</button>
            <button type="button" onClick={() => onNavigateTab?.("schedule")}>전체 일정 보기 ›</button>
          </div>
        </section>

        {/* 담당자 메모 */}
        <section className="pcrm-side-card" style={cardStyle}>
          <header><h2><StickyNote size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />담당자 메모</h2></header>
          {memoEditing ? (
            <>
              <div className="pcrm-memo-card__body">
                <textarea value={memoDraft} onChange={(e) => setMemoDraft(e.target.value)} placeholder="담당자 메모를 입력하세요." />
              </div>
              <div className="pcrm-mini-list__foot" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" onClick={() => { setMemoEditing(false); setMemoDraft(client.memo || ""); }}>취소</button>
                <button type="button" disabled={memoSaving} onClick={saveMemo}>{memoSaving ? "저장 중..." : "저장"}</button>
              </div>
            </>
          ) : (
            <>
              <div className="pcrm-memo-card__body"><p>{client.memo || "작성된 메모가 없습니다."}</p></div>
              <div className="pcrm-mini-list__foot"><button type="button" onClick={() => setMemoEditing(true)}>메모 작성 ✎</button></div>
            </>
          )}
        </section>
      </div>

      <div className="pcrm-overview-row2">
        {/* 승인 대기 */}
        <section className="pcrm-side-card" style={cardStyle}>
          <header><h2>승인 대기</h2><b>{approvalInsights.length}건</b></header>
          <div className="pcrm-mini-list">
            {approvalInsights.length === 0 ? <p className="pcrm-empty-copy">승인 대기 항목이 없습니다.</p> : approvalInsights.slice(0, 4).map((item) => (
              <Link key={item.id} href="/workflow/approvals" className="pcrm-mini-list__item" style={{ textDecoration: "none", cursor: "pointer" }}>
                <span className="pcrm-mini-list__icon"><FileCheck2 size={13} /></span>
                <span className="pcrm-mini-list__body"><strong>{item.title}</strong><small>{item.detected_at ? new Date(item.detected_at).toLocaleDateString("ko-KR") : ""}</small></span>
                <span className="pcrm-mini-list__badge" data-tone="wait">승인 대기</span>
                <ChevronRight size={14} className="pcrm-mini-list__chevron" />
              </Link>
            ))}
          </div>
        </section>

        {/* 최근 활동 */}
        <PcrmActivityTimeline activities={activities} variant="row" onViewAll={() => onNavigateTab?.("activity")} />
      </div>
    </div>
  );
}
