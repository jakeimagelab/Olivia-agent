"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, Clock, FileText, ListChecks, RefreshCw, ShieldCheck, Sparkles, XCircle } from "lucide-react";

export const C = {
  green: "#155855",
  orange: "#E85D2C",
  bg: "#F7F4EF",
  card: "#FFFFFF",
  line: "rgba(21,88,85,.13)",
  text: "#1C2B28",
  muted: "#5A7470",
  hint: "#9BB5B0",
  mint: "#EAF4F2",
};

export const priorityColor: Record<string, string> = {
  urgent: "#DC2626",
  high: "#E85D2C",
  normal: "#155855",
  low: "#7C9893",
};

export const statusColor: Record<string, string> = {
  pending: "#7C9893",
  running: "#D97706",
  completed: "#15803D",
  failed: "#DC2626",
  waiting_approval: "#E85D2C",
  canceled: "#6B7280",
  approved: "#15803D",
  rejected: "#DC2626",
  revision_requested: "#D97706",
  active: "#155855",
  paused: "#D97706",
};

export const fmtDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
};

export function Pill({ children, color }: { children: ReactNode; color?: string }) {
  const c = color || C.green;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", minHeight: 24, padding: "0 9px", borderRadius: 999, background: `${c}14`, color: c, border: `1px solid ${c}28`, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export function WorkflowShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const nav = [
    ["/workflow", "대시보드"],
    ["/workflow/tasks", "작업 큐"],
    ["/workflow/approvals", "승인 대기함"],
    ["/workflow/templates", "템플릿"],
    ["/workflow/logs", "에이전트 로그"],
  ];
  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "26px 20px 48px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <p style={{ margin: "0 0 6px", color: C.orange, fontSize: 12, fontWeight: 1000, letterSpacing: ".16em", textTransform: "uppercase" }}>Olivia Workflow</p>
            <h1 style={{ margin: 0, color: C.green, fontSize: 44, lineHeight: 1.08, letterSpacing: 0 }}>{title}</h1>
            <p style={{ margin: "10px 0 0", color: C.muted, fontSize: 15, lineHeight: 1.7 }}>{subtitle}</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", paddingTop: 28 }}>
            {nav.map(([href, label]) => (
              <Link key={href} href={href} style={{ minHeight: 36, display: "inline-flex", alignItems: "center", padding: "0 13px", borderRadius: 9, background: C.card, border: `1px solid ${C.line}`, color: C.green, fontSize: 12, fontWeight: 900, textDecoration: "none" }}>
                {label}
              </Link>
            ))}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

export function StatCard({ label, value, icon }: { label: string; value: number | string; icon?: ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: "0 10px 28px rgba(21,88,85,.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ color: C.muted, fontSize: 12, fontWeight: 900 }}>{label}</div>
          <div style={{ color: C.green, fontSize: 34, fontWeight: 1000, marginTop: 6 }}>{value}</div>
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: C.mint, color: C.green, display: "grid", placeItems: "center" }}>{icon || <Sparkles size={20} />}</div>
      </div>
    </div>
  );
}

export function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 28px rgba(21,88,85,.05)" }}>
      <div style={{ minHeight: 56, padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.line}` }}>
        <h2 style={{ margin: 0, color: C.green, fontSize: 16, fontWeight: 1000 }}>{title}</h2>
        {action}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
}

export function LoadingBox() {
  return <div style={{ color: C.muted, fontSize: 13, padding: 24 }}>불러오는 중...</div>;
}

export function EmptyBox({ text }: { text: string }) {
  return <div style={{ color: C.hint, fontSize: 13, padding: 24, textAlign: "center", background: C.mint, borderRadius: 12 }}>{text}</div>;
}

export function useApi<T>(url: string, fallback: T) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [mock, setMock] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      setMock(Boolean(json.mock));
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [url]);

  return { data, loading, mock, reload: load };
}

export function ActionButton({ children, onClick, tone = "green" }: { children: ReactNode; onClick?: () => void; tone?: "green" | "orange" | "plain" }) {
  const bg = tone === "orange" ? C.orange : tone === "plain" ? C.card : C.green;
  const color = tone === "plain" ? C.green : "#fff";
  return (
    <button onClick={onClick} style={{ minHeight: 34, border: tone === "plain" ? `1px solid ${C.line}` : 0, borderRadius: 9, background: bg, color, padding: "0 12px", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
      {children}
    </button>
  );
}

export function TaskRow({ task, onRefresh }: { task: any; onRefresh?: () => void }) {
  const run = async () => {
    await fetch(`/api/agent/tasks/${task.id}/run`, { method: "POST" });
    onRefresh?.();
  };
  const cancel = async () => {
    await fetch(`/api/agent/tasks/${task.id}/cancel`, { method: "POST" });
    onRefresh?.();
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.6fr) 1fr 120px 120px 120px 150px", gap: 12, alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.line}` }}>
      <div>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 1000 }}>{task.title}</div>
        <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{task.description || task.workflow_step_name || "-"}</div>
      </div>
      <div style={{ color: C.green, fontSize: 13, fontWeight: 900 }}>{task.client_name || task.hospital_name || "-"}</div>
      <Pill color={priorityColor[task.priority]}>{task.priority}</Pill>
      <Pill color={statusColor[task.status]}>{task.status}</Pill>
      <div style={{ color: C.muted, fontSize: 12 }}>{fmtDate(task.created_at)}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <ActionButton onClick={run}>실행</ActionButton>
        <ActionButton onClick={cancel} tone="plain">취소</ActionButton>
      </div>
    </div>
  );
}

export function ApprovalCard({ approval, onRefresh }: { approval: any; onRefresh?: () => void }) {
  const action = async (kind: "approve" | "reject" | "request-revision") => {
    const memo = kind === "request-revision" ? window.prompt("수정 요청 메모를 입력해주세요.") || "" : "";
    await fetch(`/api/agent/approvals/${approval.id}/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo }),
    });
    onRefresh?.();
  };
  return (
    <article style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <Pill color={statusColor[approval.status]}>{approval.approval_type || "other"} · {approval.status}</Pill>
          <h3 style={{ margin: "10px 0 6px", color: C.green, fontSize: 20, fontWeight: 1000 }}>{approval.title}</h3>
          <p style={{ margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.7 }}>{approval.description}</p>
        </div>
        <ShieldCheck size={26} color={C.orange} />
      </div>
      <div style={{ background: C.mint, borderRadius: 12, padding: 12, color: C.muted, fontSize: 12, lineHeight: 1.65 }}>
        <strong style={{ color: C.green }}>{approval.client_name || "고객 미연결"}</strong>
        {approval.project_name ? ` · ${approval.project_name}` : ""}
        <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontFamily: "inherit", color: C.muted }}>{JSON.stringify(approval.preview_data || {}, null, 2)}</pre>
      </div>
      {approval.status === "pending" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <ActionButton onClick={() => action("approve")}>승인하고 다음 단계 진행</ActionButton>
          <ActionButton onClick={() => action("request-revision")} tone="plain">수정 요청</ActionButton>
          <ActionButton onClick={() => action("reject")} tone="orange">반려</ActionButton>
          {approval.related_type === "mailing_queue" || approval.approval_type === "mailing" ? <Link href="/mailing" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.green, fontSize: 12, fontWeight: 900, textDecoration: "none" }}>메일링함 <ArrowRight size={13} /></Link> : null}
        </div>
      ) : null}
    </article>
  );
}

export const WorkflowIcons = { ClipboardList, Clock, ShieldCheck, FileText, CheckCircle2, XCircle, ListChecks, RefreshCw };
