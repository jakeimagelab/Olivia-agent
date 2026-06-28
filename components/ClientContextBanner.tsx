"use client";

import Link from "next/link";
import type { ClientContext } from "@/lib/clientContext";

const C = {
  teal: "#155855",
  orange: "#E85D2C",
  border: "rgba(21,88,85,.14)",
  muted: "#5A7470",
  light: "#EAF4F2",
  white: "#FFFFFF",
};

export default function ClientContextBanner({
  context,
  isLoading,
  error,
}: {
  context: ClientContext | null;
  isLoading?: boolean;
  error?: string;
}) {
  if (isLoading) {
    return <div style={boxStyle}>고객정보를 불러오는 중입니다...</div>;
  }

  if (error) {
    return <div style={{ ...boxStyle, color: C.orange }}>고객정보 연동 오류: {error}</div>;
  }

  if (!context?.clientId) {
    return (
      <div style={boxStyle}>
        <strong style={{ color: C.teal }}>고객관리와 연결되지 않은 신규 작업입니다.</strong>
        <Link href="/clients" style={linkStyle}>고객 선택해서 불러오기</Link>
      </div>
    );
  }

  const backHref = `/clients?id=${context.clientId}${context.workflowRunId ? `&workflowRunId=${context.workflowRunId}` : ""}`;

  return (
    <div style={boxStyle}>
      <div>
        <strong style={{ color: C.teal }}>현재 고객: {context.hospitalName || context.clientName}</strong>
        {context.currentStepName ? <span style={{ color: C.muted, marginLeft: 10 }}>워크플로우 단계: {context.currentStepName}</span> : null}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href={backHref} style={linkStyle}>고객관리로 돌아가기</Link>
        <Link href="/clients" style={{ ...linkStyle, background: C.white, color: C.muted }}>다른 고객 선택</Link>
      </div>
    </div>
  );
}

const boxStyle: React.CSSProperties = {
  margin: "0 auto 16px",
  maxWidth: 1100,
  background: C.light,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: "12px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 13,
  flexWrap: "wrap",
};

const linkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 32,
  padding: "0 11px",
  borderRadius: 8,
  background: C.teal,
  color: "#fff",
  fontSize: 12,
  fontWeight: 900,
  textDecoration: "none",
};
