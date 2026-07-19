"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { C } from "@/lib/theme";

const severityColor: Record<string, string> = {
  default: C.orange,
  info: C.orange,
  warning: C.orange,
  danger: C.danger,
  success: C.green,
};

export default function NextActionCard({
  client,
  workflowRun,
  onRefresh,
}: {
  client: any;
  workflowRun: any;
  onRefresh?: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(workflowRun?.id));
  const [busy, setBusy] = useState(false);
  const [additionalBusy, setAdditionalBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    if (!workflowRun?.id) return;
    setLoading(true);
    const res = await fetch(`/api/workflow/next-action?workflowRunId=${workflowRun.id}`, { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setData(json);
    setLoading(false);
  };

  useEffect(() => { load(); }, [workflowRun?.id]);

  if (!workflowRun?.id) {
    return (
      <section style={cardStyle}>
        <div>
          <h2 style={titleStyle}>{client.name}</h2>
          <p style={descStyle}>진행 중인 워크플로우가 없습니다.</p>
        </div>
      </section>
    );
  }

  const action = data || {};
  const isCompleted = workflowRun.status === "completed" || action.primaryAction === "completed";
  const color = isCompleted ? C.green : severityColor[action.severity] || C.orange;
  const appHref = buildStepAppLink({
    stepKey: action.currentStepKey || workflowRun.current_step_key,
    clientId: client.id,
    workflowRunId: workflowRun.id,
  });

  const runCurrentStep = async () => {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/workflow/run-current-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowRunId: workflowRun.id }),
    });
    const json = await res.json();
    setMsg(json.message || (json.ok ? "처리되었습니다." : json.error || "오류가 발생했습니다."));
    setBusy(false);
    await load();
    onRefresh?.();
  };

  const advance = async () => {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/workflow/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_run_id: workflowRun.id, reason: "NextActionCard manual advance" }),
    });
    const json = await res.json();
    setMsg(json.ok ? "다음 단계로 이동했습니다." : json.error || "오류가 발생했습니다.");
    setBusy(false);
    await load();
    onRefresh?.();
  };

  const startAdditionalShooting = async () => {
    setAdditionalBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/workflow/runs/${workflowRun.id}/additional-shooting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_step_key: "quote" }),
      });
      const json = await res.json();
      setMsg(json.ok ? "추가 촬영 하위 워크플로우를 생성했습니다." : json.error || "추가 촬영 생성에 실패했습니다.");
      if (json.ok) onRefresh?.();
    } finally {
      setAdditionalBusy(false);
    }
  };

  const primaryButton = () => {
    if (isCompleted) return null;
    if (action.primaryAction === "run_current_step") {
      return <button onClick={runCurrentStep} disabled={busy} style={primaryStyle(color)}>{busy ? "처리 중..." : action.primaryActionLabel}</button>;
    }
    if (action.primaryAction === "approve_required") {
      return <Link href="/workflow/approvals" style={primaryLinkStyle(color)}>{action.primaryActionLabel}</Link>;
    }
    if (action.primaryAction === "send_ready_mail") {
      return <Link href={`/mailing?clientId=${client.id}&workflowRunId=${workflowRun.id}&stepKey=${action.currentStepKey}`} style={primaryLinkStyle(color)}>{action.primaryActionLabel}</Link>;
    }
    if (action.primaryAction === "advance_step") {
      return <button onClick={advance} disabled={busy} style={primaryStyle(color)}>{busy ? "이동 중..." : action.primaryActionLabel}</button>;
    }
    if (action.primaryAction === "fix_failed_task") {
      return <Link href="/workflow/tasks?status=failed" style={primaryLinkStyle(color)}>{action.primaryActionLabel}</Link>;
    }
    return <Link href={appHref} style={primaryLinkStyle(color)}>{action.primaryActionLabel || "관련 앱 열기"}</Link>;
  };

  return (
    <section style={{ ...cardStyle, borderColor: `${color}55` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, color, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 5 }}>NEXT ACTION</div>
          <h2 style={titleStyle}>{client.name}</h2>
          {workflowRun.run_kind === "additional_shooting" && <StatusPill color={C.purple}>추가 촬영</StatusPill>}
          <p style={descStyle}>현재 단계: <strong style={{ color }}>{isCompleted ? "전체 완료" : loading ? "불러오는 중..." : action.currentStepName}</strong></p>
          <p style={{ margin: "5px 0 0", color, fontSize: 14, fontWeight: 900 }}>{isCompleted ? "워크플로우의 모든 단계가 완료되었습니다." : loading ? "다음 액션을 계산하는 중입니다." : action.nextActionLabel || action.label}</p>
          {action.blockedReason ? <p style={{ margin: "5px 0 0", color: C.muted, fontSize: 12 }}>{action.blockedReason}</p> : null}
        </div>
        <div style={{ minWidth: 150, textAlign: "right" }}>
          <div style={{ fontSize: 10, color: C.hint, fontWeight: 900, marginBottom: 5 }}>진행률</div>
          <div style={{ fontSize: 24, color, fontWeight: 1000 }}>{isCompleted ? 100 : action.progress ?? 0}%</div>
          <div style={{ height: 5, borderRadius: 999, background: C.light, overflow: "hidden", marginTop: 5 }}>
            <div style={{ width: `${isCompleted ? 100 : action.progress ?? 0}%`, height: "100%", background: color }} />
          </div>
        </div>
      </div>

      {isCompleted ? (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 11 }}>
          <StatusPill color={C.green}>전체 단계 완료</StatusPill>
          <StatusPill color={C.green}>남은 작업 없음</StatusPill>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 11 }}>
          <StatusPill color={action.canRunTasks ? C.orange : C.hint}>자동처리 {action.canRunTasks ? "가능" : "대기"}</StatusPill>
          <StatusPill color={action.canApprove ? C.orange : C.hint}>승인 {action.canApprove ? "필요" : "없음"}</StatusPill>
          <StatusPill color={action.canSendMail ? C.green : C.hint}>메일 {action.canSendMail ? "발송대기" : "대기없음"}</StatusPill>
          <StatusPill color={action.primaryAction === "fix_failed_task" ? C.danger : C.hint}>오류 {action.primaryAction === "fix_failed_task" ? "있음" : "없음"}</StatusPill>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {primaryButton()}
        {!isCompleted && <Link href={appHref} style={secondaryStyle}>관련 앱 열기</Link>}
        {!isCompleted && <Link href="/workflow/approvals" style={secondaryStyle}>승인 대기 보기</Link>}
        {workflowRun.run_kind !== "additional_shooting" && (
          <button type="button" onClick={startAdditionalShooting} disabled={additionalBusy} style={{ ...secondaryStyle, cursor: additionalBusy ? "wait" : "pointer", fontFamily: "inherit" }}>
            {additionalBusy ? "생성 중..." : "+ 추가 촬영 시작"}
          </button>
        )}
      </div>
      {(workflowRun.original_expires_at || workflowRun.retouched_expires_at) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          {workflowRun.original_expires_at && <RetentionPill label="원본 1년 보관" date={workflowRun.original_expires_at}/>}
          {workflowRun.retouched_expires_at && <RetentionPill label="보정본 3년 보관" date={workflowRun.retouched_expires_at}/>}
        </div>
      )}
      {msg ? <div style={{ marginTop: 12, color: msg.includes("오류") ? C.danger : C.teal, fontSize: 12, fontWeight: 800 }}>{msg}</div> : null}
    </section>
  );
}

function RetentionPill({ label, date }: { label: string; date: string }) {
  const expired = new Date(date).getTime() <= Date.now();
  return (
    <span style={{ padding: "6px 10px", borderRadius: 8, background: expired ? `${C.danger}10` : C.mint, color: expired ? C.danger : C.muted, fontSize: 11, fontWeight: 800 }}>
      {label} · {new Date(date).toLocaleDateString("ko-KR")}{expired ? " 만료" : "까지"}
    </span>
  );
}

function StatusPill({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ padding: "4px 9px", borderRadius: 999, background: `${color}16`, color, fontSize: 11, fontWeight: 900, border: `1px solid ${color}28` }}>{children}</span>;
}

const cardStyle: React.CSSProperties = {
  background: C.white,
  border: `1.5px solid ${C.border}`,
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 8px 22px rgba(232,93,44,.08)",
};

const titleStyle: React.CSSProperties = { margin: 0, color: C.teal, fontSize: 20, fontWeight: 1000 };
const descStyle: React.CSSProperties = { margin: "5px 0 0", color: C.muted, fontSize: 12 };
const primaryStyle = (_color: string): React.CSSProperties => ({ height: 38, padding: "0 16px", border: 0, borderRadius: 9, background: C.orange, color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" });
const primaryLinkStyle = (color: string): React.CSSProperties => ({ ...primaryStyle(color), display: "inline-flex", alignItems: "center", textDecoration: "none" });
const secondaryStyle: React.CSSProperties = { height: 38, padding: "0 13px", borderRadius: 9, background: C.white, border: `1px solid ${C.border}`, color: C.teal, fontSize: 12, fontWeight: 900, display: "inline-flex", alignItems: "center", textDecoration: "none" };
