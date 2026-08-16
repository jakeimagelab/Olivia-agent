"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { C, R } from "@/lib/theme";

type ConsistencyIssue = {
  workflowRunId: string;
  clientId: string | null;
  clientName: string;
  currentStepKey: string;
  currentStepName: string;
  foundStepKey: string;
  foundStepName: string;
  resourceType: "quote" | "contract" | "conti" | "gallery";
  resourceId: string | null;
};

// 코드 요청서 7차(2026-08-16) — "문서/갤러리는 있는데 워크플로우 단계가 그만큼 안 넘어간"
// 프로젝트를 관리자가 우연히 발견하기 전에 목록으로 모아 보여준다. 자동으로 단계를 바꾸지
// 않는다 — "지금 완료 처리"를 눌러야만 실제로 처리된다(lib/workflowAutomation.ts의
// findWorkflowConsistencyIssues 참고). 문제가 없으면 위젯 자체가 안 보인다(조용히 통과).
export default function WorkflowConsistencyWidget() {
  const [issues, setIssues] = useState<ConsistencyIssue[] | null>(null);
  const [completingKey, setCompletingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    fetch("/api/workflow-consistency", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setIssues(d.issues); })
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const completeNow = async (issue: ConsistencyIssue) => {
    const key = issue.workflowRunId + issue.foundStepKey;
    setCompletingKey(key);
    setError("");
    try {
      const res = issue.resourceType === "quote" && issue.resourceId
        ? await fetch(`/api/quotes/${issue.resourceId}/complete`, { method: "POST" })
        : await fetch(`/api/workflow-runs/${issue.workflowRunId}/complete-step`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stepKey: issue.foundStepKey }),
          });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "완료 처리에 실패했습니다.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "완료 처리에 실패했습니다.");
    } finally {
      setCompletingKey(null);
    }
  };

  if (!issues || issues.length === 0) return null;

  return (
    <div className="pc-card pc-card--padded" style={{ marginBottom: 14, border: `1.5px solid ${C.orange}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <AlertTriangle size={16} color={C.orange} />
        <strong style={{ fontSize: 13, color: C.ink }}>정합성 점검 — {issues.length}건</strong>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {issues.map((issue) => {
          const key = issue.workflowRunId + issue.foundStepKey;
          return (
            <div key={key} style={{ padding: "10px 12px", borderRadius: R.sm, background: "#FFF7F0", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
                {issue.clientName || "이름 없는 고객"} — {issue.foundStepName}은 있는데 아직 {issue.currentStepName} 단계에 머물러 있습니다.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {issue.clientId ? (
                  <Link href={`/clients?id=${issue.clientId}`} style={{ fontSize: 11.5, fontWeight: 700, color: C.teal, textDecoration: "none" }}>
                    관련 문서 열기 →
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => completeNow(issue)}
                  disabled={completingKey === key}
                  style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: "#fff", background: C.teal, border: "none", borderRadius: R.sm, padding: "6px 12px", cursor: completingKey === key ? "not-allowed" : "pointer", opacity: completingKey === key ? 0.7 : 1 }}
                >
                  {completingKey === key ? "처리 중..." : "지금 완료 처리"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error ? <p style={{ marginTop: 8, fontSize: 11.5, color: C.danger, fontWeight: 700 }}>{error}</p> : null}
    </div>
  );
}
