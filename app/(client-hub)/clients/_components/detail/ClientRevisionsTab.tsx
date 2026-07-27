"use client";

import { useCallback, useEffect, useState } from "react";
import { PenLine } from "lucide-react";
import { C, R } from "@/lib/theme";
import PcrmCollaborationPanel from "../PcrmCollaborationPanel";

const cardStyle: React.CSSProperties = { background: C.white, border: `1px solid ${C.border}`, borderRadius: R.lg, boxShadow: "0 5px 18px rgba(21,88,85,.055)" };
const STATUS_LABEL: Record<string, string> = { requested: "대기", in_progress: "처리 중", completed: "완료", rejected: "거절" };

export default function ClientRevisionsTab({ clientId, workflowRunId, managerName }: { clientId: string; workflowRunId?: string; managerName?: string }) {
  const [revisions, setRevisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/client-portal/revisions?clientId=${clientId}`, { cache: "no-store" });
      const d = await res.json();
      if (d.ok) setRevisions(d.revisions || []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const update = async (id: string, patch: { status?: string; adminReply?: string }) => {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/client-portal/revisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "저장 실패");
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {workflowRunId && <PcrmCollaborationPanel clientId={clientId} workflowRunId={workflowRunId} managerName={managerName} />}

      <section className="pcrm-project-panel" style={cardStyle}>
        <header>
          <div><h2>고객 수정 요청</h2><span>고객 포털에서 접수된 수정 요청입니다.</span></div>
          <b>{revisions.length}건</b>
        </header>
        <div className="pcrm-revision-list">
          {loading ? (
            <p className="pcrm-empty-copy">불러오는 중...</p>
          ) : revisions.length === 0 ? (
            <p className="pcrm-empty-copy">수정 요청이 없습니다.</p>
          ) : revisions.map((row) => (
            <div key={row.id} className="pcrm-revision-item">
              <div className="pcrm-revision-summary" style={{ gridTemplateColumns: "1fr 110px 90px" }}>
                <span className="pcrm-revision-title"><PenLine size={14} />{row.title}</span>
                <select value={row.status} disabled={busy === row.id} onChange={(event) => void update(row.id, { status: event.target.value })}>
                  {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <small className="pcrm-revision-date">{new Date(row.created_at).toLocaleDateString("ko-KR")}</small>
              </div>
              <div className="pcrm-revision-detail">
                <p>{row.content || "요청 내용이 없습니다."}</p>
                <textarea
                  value={reply[row.id] ?? row.admin_reply ?? ""}
                  onChange={(event) => setReply((current) => ({ ...current, [row.id]: event.target.value }))}
                  placeholder="답변을 입력하세요."
                  rows={2}
                />
                <div className="pcrm-revision-detail__actions">
                  <button type="button" disabled={busy === row.id} onClick={() => void update(row.id, { adminReply: reply[row.id] ?? row.admin_reply ?? "" })}>답변 저장</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
