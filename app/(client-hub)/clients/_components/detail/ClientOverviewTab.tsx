"use client";

import { useEffect, useState } from "react";
import { CalendarDays, FileText, StickyNote } from "lucide-react";
import { C, R } from "@/lib/theme";
import { STEP_NAME } from "@/lib/workflow";
import { formatArtifactSize, type WorkflowArtifact } from "@/lib/workflowArtifacts";
import NextActionCard from "@/components/NextActionCard";
import PcrmActivityTimeline from "../PcrmActivityTimeline";

const cardStyle: React.CSSProperties = { background: C.white, border: `1px solid ${C.border}`, borderRadius: R.lg, boxShadow: "0 5px 18px rgba(21,88,85,.055)" };
const TYPE_LABEL: Record<string, string> = { quote: "견적서", contract: "계약서", conti: "콘티" };

export default function ClientOverviewTab({ client, workflowRun, artifacts, activities, onRefresh }: {
  client: any; workflowRun: any; artifacts: WorkflowArtifact[]; activities: any[]; onRefresh: () => void;
}) {
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);

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

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <NextActionCard client={client} workflowRun={workflowRun} onRefresh={onRefresh} />

      <div className="pcrm-overview-grid">
        <section className="pcrm-side-card" style={cardStyle}>
          <header><h2>연결 프로젝트 요약</h2></header>
          {workflowRun ? (
            <div className="pcrm-overview-summary">
              <strong>{workflowRun.project_name || "촬영 프로젝트"}</strong>
              <span>담당 {workflowRun.manager_name || "미지정"}</span>
              <span>촬영 예정일 {workflowRun.shoot_date ? new Date(workflowRun.shoot_date).toLocaleDateString("ko-KR") : "—"}</span>
              <i data-state={workflowRun.status === "completed" ? "done" : "active"}>
                {workflowRun.status === "completed" ? "완료" : STEP_NAME[workflowRun.current_step_key] || workflowRun.current_step_key}
              </i>
            </div>
          ) : <p className="pcrm-empty-copy">연결된 프로젝트가 없습니다.</p>}
        </section>

        <section className="pcrm-side-card" style={cardStyle}>
          <header><h2>최근 문서</h2><FileText size={16} /></header>
          {artifacts.length === 0 ? <p className="pcrm-empty-copy">등록된 문서가 없습니다.</p> : artifacts.slice(0, 4).map((doc) => (
            <button key={doc.id} type="button">
              <span>{doc.title || doc.file_name}<small>{TYPE_LABEL[doc.document_type] || doc.document_type} · {formatArtifactSize(doc.file_size)}</small></span>
              <b>{new Date(doc.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</b>
            </button>
          ))}
        </section>

        <section className="pcrm-side-card" style={cardStyle}>
          <header><h2>예정 일정</h2><CalendarDays size={16} /></header>
          {scheduleLoading ? <p className="pcrm-empty-copy">불러오는 중...</p> : upcoming.length === 0 ? <p className="pcrm-empty-copy">예정된 일정이 없습니다.</p> : upcoming.map((task) => (
            <button key={task.id} type="button">
              <span>{task.title}<small>{task.location || "장소 미정"}</small></span>
              <b>{task.date.slice(5).replace("-", ".")}</b>
            </button>
          ))}
        </section>
      </div>

      <PcrmActivityTimeline activities={activities} variant="compact" />

      {client.memo && (
        <section className="pcrm-side-card" style={{ ...cardStyle, padding: "16px 18px" }}>
          <header style={{ padding: 0, border: 0, marginBottom: 8 }}><h2 style={{ display: "flex", alignItems: "center", gap: 6 }}><StickyNote size={15} /> 담당자 메모</h2></header>
          <p style={{ margin: 0, color: "#5a7470", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{client.memo}</p>
        </section>
      )}
    </div>
  );
}
