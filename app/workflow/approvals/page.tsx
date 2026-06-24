"use client";

import { ActionButton, ApprovalCard, C, EmptyBox, LoadingBox, Pill, SectionCard, useApi, WorkflowShell } from "../WorkflowComponents";
import { useState } from "react";

const fallback = { ok: true, approvals: [] };

export default function WorkflowApprovalsPage() {
  const { data, loading, mock, reload } = useApi<any>("/api/agent/approvals", fallback);
  const [status, setStatus] = useState("pending");
  const approvals = (data.approvals || []).filter((approval: any) => status === "all" || approval.status === status);

  return (
    <WorkflowShell title="승인 대기함" subtitle="고객에게 발송되거나 외부에 노출되기 전 대표님 확인이 필요한 항목을 모아둡니다.">
      {mock ? <div style={{ marginBottom: 14 }}><Pill color={C.orange}>샘플 승인 항목</Pill></div> : null}
      <SectionCard
        title="승인 항목"
        action={<div style={{ display: "flex", gap: 8 }}>{["pending", "approved", "revision_requested", "rejected", "all"].map((s) => <ActionButton key={s} tone={status === s ? "green" : "plain"} onClick={() => setStatus(s)}>{s}</ActionButton>)}</div>}
      >
        {loading ? <LoadingBox /> : approvals.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            {approvals.map((approval: any) => <ApprovalCard key={approval.id} approval={approval} onRefresh={reload} />)}
          </div>
        ) : <EmptyBox text="조건에 맞는 승인 항목이 없습니다." />}
      </SectionCard>
    </WorkflowShell>
  );
}
