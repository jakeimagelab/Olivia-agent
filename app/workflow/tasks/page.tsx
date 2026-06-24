"use client";

import { ActionButton, C, EmptyBox, LoadingBox, Pill, SectionCard, TaskRow, useApi, WorkflowShell, priorityColor, statusColor } from "../WorkflowComponents";
import { useState } from "react";

const fallback = { ok: true, tasks: [] };

export default function WorkflowTasksPage() {
  const { data, loading, mock, reload } = useApi<any>("/api/agent/tasks", fallback);
  const [status, setStatus] = useState("all");
  const tasks = (data.tasks || []).filter((task: any) => status === "all" || task.status === status);

  return (
    <WorkflowShell title="에이전트 작업 큐" subtitle="Olivia가 생성하거나 실행해야 할 작업을 우선순위와 상태별로 관리합니다.">
      {mock ? <div style={{ marginBottom: 14 }}><Pill color={C.orange}>샘플 작업 큐</Pill></div> : null}
      <SectionCard
        title="작업 리스트"
        action={<div style={{ display: "flex", gap: 8 }}>
          {["all", "pending", "running", "waiting_approval", "completed", "failed", "canceled"].map((s) => (
            <ActionButton key={s} tone={status === s ? "green" : "plain"} onClick={() => setStatus(s)}>{s}</ActionButton>
          ))}
        </div>}
      >
        {loading ? <LoadingBox /> : tasks.length ? (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 920 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.6fr) 1fr 120px 120px 120px 150px", gap: 12, color: C.hint, fontSize: 11, fontWeight: 1000, paddingBottom: 10, borderBottom: `1px solid ${C.line}` }}>
                <span>작업명</span><span>병원명</span><span>우선순위</span><span>상태</span><span>생성일</span><span>액션</span>
              </div>
              {tasks.map((task: any) => <TaskRow key={task.id} task={task} onRefresh={reload} />)}
            </div>
          </div>
        ) : <EmptyBox text="작업 큐가 비어 있습니다." />}
      </SectionCard>
    </WorkflowShell>
  );
}
