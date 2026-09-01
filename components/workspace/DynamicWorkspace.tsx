"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { workspaceRegistry } from "@/components/workspace/WorkspaceRegistry";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";

// 채팅 아래(split) 혹은 전체화면(fullscreen)으로 뜨는 기능 화면 셸. 어떤 워크스페이스를 보여줄지는
// 하드코딩된 if(type==='quote') 체인이 아니라 WorkspaceRegistry에서 찾는다 — 새 워크스페이스를
// 추가할 땐 화면 컴포넌트를 만들고 레지스트리에 한 줄만 추가하면 이 파일은 그대로 둔다.
// split: 페이지 레이아웃 안에 그대로 그려져 부모가 준 높이를 채운다.
// fullscreen: 사이드바까지 덮도록 body에 포털로 빠져나가 뷰포트 전체를 차지한다(ESC로도 종료).
export default function DynamicWorkspace() {
  const { type, mode, clientId, workflowRunId, resourceId, clientName, startInPreview } = useWorkspaceStore();
  const isFullscreen = mode === "fullscreen";
  const drawerOpen = useOliviaLayoutStore((state) => state.drawerOpen);
  const setDrawerOpen = useOliviaLayoutStore((state) => state.setDrawerOpen);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") executeOliviaAction({ type: "EXIT_FULLSCREEN" }); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  const entry = type ? workspaceRegistry[type] : undefined;
  if (!type || !entry) return null;
  const Icon = entry.icon;
  const Builder = entry.component;

  const builderProps = {
    mode: "modal" as const,
    clientId,
    workflowRunId,
    resourceId,
    startInPreview,
    onClose: () => executeOliviaAction({ type: "CLOSE_WORKSPACE" }),
    onPublished: () => {},
  };

  const body = (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
      borderRadius: isFullscreen ? 0 : 22,
      background: "#fff",
      border: isFullscreen ? "none" : "1px solid rgba(21,88,85,.08)",
      boxShadow: isFullscreen ? "none" : "0 8px 28px rgba(21,88,85,.06)",
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
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 800, color: "#155855", letterSpacing: ".04em", marginBottom: 1 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22876A", flexShrink: 0 }} />
              OLIVIA CONTEXT ACTIVE
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "#1C2B28" }}>
              {clientName ? `${clientName} · ` : ""}{entry.label}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => executeOliviaAction({ type: isFullscreen ? "EXIT_FULLSCREEN" : "ENTER_FULLSCREEN" })}
            aria-label={isFullscreen ? "전체화면 종료" : "전체화면"}
            title={isFullscreen ? "전체화면 종료" : "전체화면"}
            style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(21,88,85,0.12)", background: "#fff", color: "#5A7470", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            type="button"
            onClick={() => executeOliviaAction({ type: "CLOSE_WORKSPACE" })}
            aria-label="닫기"
            title="닫기"
            style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(21,88,85,0.12)", background: "#fff", color: "#5A7470", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <Builder {...builderProps} />
      </div>
    </div>
  );

  if (isFullscreen && typeof document !== "undefined") {
    return createPortal(
      <div className="olivia-fullscreen-stage">
        <div className="olivia-fullscreen-stage__workspace">{body}</div>
        <button type="button" className="olivia-floating-core" onClick={() => setDrawerOpen(!drawerOpen)} aria-label="Olivia 대화 열기"><OliviaIcon size={18} /></button>
        <aside className={`olivia-chat-drawer${drawerOpen ? " is-open" : ""}`} aria-hidden={!drawerOpen}>
          <button type="button" className="olivia-chat-drawer__close" onClick={() => setDrawerOpen(false)}>닫기</button>
          <OliviaChatDockTarget id={`fullscreen:${type}:${resourceId ?? "new"}`} priority={100} className="olivia-fullscreen-chat-dock" />
        </aside>
      </div>,
      document.body,
    );
  }
  return body;
}
