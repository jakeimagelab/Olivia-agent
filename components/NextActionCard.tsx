"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildStepAppLink } from "@/lib/clientAppLinks";

const C = {
  teal: "#155855",
  orange: "#E85D2C",
  green: "#22876A",
  white: "#FFFFFF",
  border: "rgba(21,88,85,.12)",
  muted: "#5A7470",
  hint: "#9BB5B0",
  light: "#EAF4F2",
  danger: "#DC2626",
};

const severityColor: Record<string, string> = {
  default: C.teal,
  info: "#2563EB",
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
  const color = severityColor[action.severity] || C.teal;
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

  const primaryButton = () => {
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
          <p style={descStyle}>현재 단계: <strong style={{ color: C.teal }}>{loading ? "불러오는 중..." : action.currentStepName}</strong></p>
          <p style={{ margin: "8px 0 0", color, fontSize: 16, fontWeight: 900 }}>{loading ? "다음 액션을 계산하는 중입니다." : action.nextActionLabel || action.label}</p>
          {action.blockedReason ? <p style={{ margin: "5px 0 0", color: C.muted, fontSize: 12 }}>{action.blockedReason}</p> : null}
        </div>
        <div style={{ minWidth: 150, textAlign: "right" }}>
          <div style={{ fontSize: 10, color: C.hint, fontWeight: 900, marginBottom: 5 }}>진행률</div>
          <div style={{ fontSize: 30, color: C.teal, fontWeight: 1000 }}>{action.progress ?? 0}%</div>
          <div style={{ height: 6, borderRadius: 999, background: C.light, overflow: "hidden", marginTop: 7 }}>
            <div style={{ width: `${action.progress ?? 0}%`, height: "100%", background: color }} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 16 }}>
        <StatusPill color={action.canRunTasks ? "#2563EB" : C.hint}>자동처리 {action.canRunTasks ? "가능" : "대기"}</StatusPill>
        <StatusPill color={action.canApprove ? C.orange : C.hint}>승인 {action.canApprove ? "필요" : "없음"}</StatusPill>
        <StatusPill color={action.canSendMail ? C.green : C.hint}>메일 {action.canSendMail ? "발송대기" : "대기없음"}</StatusPill>
        <StatusPill color={action.primaryAction === "fix_failed_task" ? C.danger : C.hint}>오류 {action.primaryAction === "fix_failed_task" ? "있음" : "없음"}</StatusPill>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
        {primaryButton()}
        <Link href={appHref} style={secondaryStyle}>관련 앱 열기</Link>
        <Link href="/workflow/approvals" style={secondaryStyle}>승인 대기 보기</Link>
      </div>
      {msg ? <div style={{ marginTop: 12, color: msg.includes("오류") ? C.danger : C.teal, fontSize: 12, fontWeight: 800 }}>{msg}</div> : null}
    </section>
  );
}

function StatusPill({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ padding: "4px 9px", borderRadius: 999, background: `${color}16`, color, fontSize: 11, fontWeight: 900, border: `1px solid ${color}28` }}>{children}</span>;
}

const cardStyle: React.CSSProperties = {
  background: C.white,
  border: `1.5px solid ${C.border}`,
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 10px 28px rgba(21,88,85,.08)",
};

const titleStyle: React.CSSProperties = { margin: 0, color: C.teal, fontSize: 24, fontWeight: 1000 };
const descStyle: React.CSSProperties = { margin: "7px 0 0", color: C.muted, fontSize: 13 };
const primaryStyle = (color: string): React.CSSProperties => ({ height: 42, padding: "0 18px", border: 0, borderRadius: 10, background: color, color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" });
const primaryLinkStyle = (color: string): React.CSSProperties => ({ ...primaryStyle(color), display: "inline-flex", alignItems: "center", textDecoration: "none" });
const secondaryStyle: React.CSSProperties = { height: 42, padding: "0 15px", borderRadius: 10, background: C.white, border: `1px solid ${C.border}`, color: C.teal, fontSize: 13, fontWeight: 900, display: "inline-flex", alignItems: "center", textDecoration: "none" };
