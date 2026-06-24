"use client";

import { C, EmptyBox, LoadingBox, Pill, SectionCard, useApi, WorkflowShell, fmtDate } from "../_components";

const fallback = { ok: true, logs: [] };

export default function WorkflowLogsPage() {
  const { data, loading, mock } = useApi<any>("/api/workflow/logs", fallback);
  const logs = data.logs || [];

  return (
    <WorkflowShell title="에이전트 로그" subtitle="Olivia가 수행한 작업, 승인 요청, 단계 변경, 실패 사유를 시간순으로 기록합니다.">
      {mock ? <div style={{ marginBottom: 14 }}><Pill color={C.orange}>샘플 로그</Pill></div> : null}
      <SectionCard title="실행 기록">
        {loading ? <LoadingBox /> : logs.length ? (
          <div style={{ display: "grid", gap: 0 }}>
            {logs.map((log: any) => (
              <div key={log.id} style={{ display: "grid", gridTemplateColumns: "130px 170px 1fr 90px", gap: 12, alignItems: "start", padding: "14px 0", borderBottom: `1px solid ${C.line}` }}>
                <span style={{ color: C.muted, fontSize: 12 }}>{fmtDate(log.created_at)}</span>
                <Pill color={log.success === false ? C.orange : C.green}>{log.log_type}</Pill>
                <div>
                  <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>{log.message}</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>{log.client_name || ""} {log.input_summary ? `· ${log.input_summary}` : ""}</div>
                </div>
                <Pill color={log.success === false ? C.orange : C.green}>{log.success === false ? "실패" : "성공"}</Pill>
              </div>
            ))}
          </div>
        ) : <EmptyBox text="에이전트 로그가 없습니다." />}
      </SectionCard>
    </WorkflowShell>
  );
}
