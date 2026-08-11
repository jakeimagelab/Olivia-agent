"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Clapperboard, FileSignature, FileText, Maximize2, Minimize2, X } from "lucide-react";
import QuoteBuilder from "@/components/quote/QuoteBuilder";
import ContractBuilder from "@/components/contract/ContractBuilder";
import ContiBuilder from "@/components/conti/ContiBuilder";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";

const WORKSPACE_META: Record<string, { label: string; icon: React.ComponentType<{ size?: number }> }> = {
  quote: { label: "견적서 작성", icon: FileText },
  contract: { label: "계약서 작성", icon: FileSignature },
  conti: { label: "콘티 작성", icon: Clapperboard },
};

// 채팅 아래(split) 혹은 전체화면(fullscreen)으로 뜨는 기능 화면 셸.
// split: 페이지 레이아웃 안에 그대로 그려져 부모가 준 높이를 채운다.
// fullscreen: 사이드바까지 덮도록 body에 포털로 빠져나가 뷰포트 전체를 차지한다(ESC로도 종료).
export default function DynamicWorkspace() {
  const { type, mode, clientId, workflowRunId, resourceId, clientName, closeWorkspace, enterFullscreen, exitFullscreen } = useWorkspaceStore();
  const isFullscreen = mode === "fullscreen";

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") exitFullscreen(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, exitFullscreen]);

  if (!type) return null;
  const meta = WORKSPACE_META[type];
  const Icon = meta.icon;

  const builderProps = {
    mode: "modal" as const,
    clientId,
    workflowRunId,
    resourceId,
    onClose: closeWorkspace,
    onPublished: () => {},
  };

  const body = (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
      borderRadius: isFullscreen ? 0 : 22,
      background: "#fff",
      border: isFullscreen ? "none" : "1px solid rgba(21,88,85,0.08)",
      boxShadow: isFullscreen ? "none" : "0 12px 40px rgba(20,60,55,0.06)",
      overflow: "hidden",
    }}>
      <header style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, padding: "12px 18px", borderBottom: "1px solid rgba(21,88,85,0.1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: "#EAF4F2", color: "#155855", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={16} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "#155855" }}>{meta.label}</div>
            {clientName ? <div style={{ fontSize: 11, color: "#6F7E7A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clientName}</div> : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={isFullscreen ? exitFullscreen : enterFullscreen}
            aria-label={isFullscreen ? "전체화면 종료" : "전체화면"}
            title={isFullscreen ? "전체화면 종료" : "전체화면"}
            style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(21,88,85,0.12)", background: "#fff", color: "#5A7470", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            type="button"
            onClick={closeWorkspace}
            aria-label="닫기"
            title="닫기"
            style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(21,88,85,0.12)", background: "#fff", color: "#5A7470", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {type === "quote" ? <QuoteBuilder {...builderProps} /> : null}
        {type === "contract" ? <ContractBuilder {...builderProps} /> : null}
        {type === "conti" ? <ContiBuilder {...builderProps} /> : null}
      </div>
    </div>
  );

  if (isFullscreen && typeof document !== "undefined") {
    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 10040, background: "#fff" }}>{body}</div>,
      document.body,
    );
  }
  return body;
}
