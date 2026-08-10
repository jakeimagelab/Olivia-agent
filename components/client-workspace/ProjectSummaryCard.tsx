"use client";

import Link from "next/link";
import { Calendar, Camera, ClipboardCheck, Clock, User } from "lucide-react";
import { C } from "@/lib/theme";
import type { WorkspaceWorkflowSummary } from "@/lib/clientWorkspace/types";
import type { ClientWorkspaceNextAction } from "@/lib/clientWorkspace/nextAction";

function relativeTime(iso?: string | null): string {
  if (!iso) return "-";
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

function Row({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ width: 26, height: 26, borderRadius: 7, background: C.mint, color: C.teal, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ fontSize: 11.5, color: C.muted, width: 76, flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 12.5, fontWeight: highlight ? 800 : 600, color: highlight ? C.orange : C.ink,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </span>
    </div>
  );
}

const linkStyle: React.CSSProperties = { color: C.orange, fontWeight: 800, cursor: "pointer", background: "none", border: "none", padding: 0, font: "inherit", textDecoration: "none" };

const MODAL_TOOL_STEPS = new Set(["quote", "contract", "conti"]);

// 고객관리 3열 복귀(2026-08-10) — "다음 할 일" row만 액션 인지형으로 바뀐다.
// 견적서/계약서/콘티(tool_link/publish_pending)면 페이지 이동 대신 Workspace Modal을 연다.
export default function ProjectSummaryCard({
  activeProject,
  workflowSummary,
  recentActivityAt,
  nextAction,
  onOpenToolModal,
}: {
  activeProject: Record<string, any>;
  workflowSummary: WorkspaceWorkflowSummary | null;
  recentActivityAt?: string | null;
  nextAction: ClientWorkspaceNextAction;
  onOpenToolModal: (stepKey: "quote" | "contract" | "conti") => void;
}) {
  const nextActionValue: React.ReactNode = (() => {
    if (nextAction.kind === "tool_link" && MODAL_TOOL_STEPS.has(nextAction.stepKey)) {
      return <button type="button" onClick={() => onOpenToolModal(nextAction.stepKey)} style={linkStyle}>{nextAction.title}</button>;
    }
    if (nextAction.kind === "tool_link") {
      return <Link href={nextAction.ctaHref} style={linkStyle}>{nextAction.title}</Link>;
    }
    if (nextAction.kind === "publish_pending") {
      if (MODAL_TOOL_STEPS.has(nextAction.relatedType)) {
        return <button type="button" onClick={() => onOpenToolModal(nextAction.relatedType as "quote" | "contract" | "conti")} style={linkStyle}>{nextAction.title}</button>;
      }
      return <span>{nextAction.title}</span>;
    }
    return workflowSummary?.nextActionLabel ?? "-";
  })();

  return (
    <div className="pc-card pc-card--padded">
      <Row icon={<Camera size={13} />} label="현재 프로젝트" value={activeProject.project_name || "제목 없는 프로젝트"} />
      <Row icon={<ClipboardCheck size={13} />} label="현재 상태" value={workflowSummary?.currentStepName ?? "-"} highlight />
      <Row icon={<Clock size={13} />} label="다음 할 일" value={nextActionValue} />
      <Row icon={<Calendar size={13} />} label="촬영 예정일" value={activeProject.shoot_date ? new Date(activeProject.shoot_date).toLocaleDateString("ko-KR") : "미정"} />
      <Row icon={<User size={13} />} label="담당자" value={activeProject.manager_name || "미지정"} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0" }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: C.mint, color: C.teal, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Clock size={13} />
        </span>
        <span style={{ fontSize: 11.5, color: C.muted, width: 76, flexShrink: 0 }}>최근 활동</span>
        <span style={{ fontSize: 12.5, color: C.hint }}>{relativeTime(recentActivityAt)}</span>
      </div>
    </div>
  );
}
