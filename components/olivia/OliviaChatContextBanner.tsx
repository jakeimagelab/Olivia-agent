"use client";

import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { workspaceRegistry } from "@/components/workspace/WorkspaceRegistry";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";

// 스펙 §42 — Full Editor를 직접 열어놓은 채 Chat을 열면(또는 split-view에서 이미 작업 중인
// 화면이 있으면) "지금 무엇을 작업 중인지"를 채팅 쪽에서도 보여준다. split(왼쪽 워크스페이스
// + 오른쪽 채팅) 상태에서만 의미가 있다 — fullscreen에서는 DynamicWorkspace.tsx 자체 헤더가
// 이미 같은 정보("OLIVIA CONTEXT ACTIVE" + 클라이언트명 + 라벨)를 보여주므로 중복 표시하지
// 않는다(견적서 UX 개편, 2026-08-31).
//
// OLIVIA OS Phase 3(스펙 §23/§24) — Desktop 창 조작 라우트에서는 이 슬롯을 재사용해 "지금 어느
// 창을 보고 있는지"를 보여준다. Desktop 창은 legacy 라우트에서 절대 열리지 않으므로
// activeWindowId가 채워져 있으면 이 배너를 Desktop 전용으로 쓰고, 없으면 기존 legacy
// split-view 분기로 그대로 폴백한다 — 다른 라우트 동작은 전혀 안 바뀐다.
export default function OliviaChatContextBanner() {
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const activeWindow = useOliviaDesktopStore((state) => (
    state.activeWindowId ? state.windows[state.activeWindowId] : null
  ));
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const activeClientName = useOliviaContextStore((state) => state.activeClientName);

  const type = useWorkspaceStore((state) => state.type);
  const mode = useWorkspaceStore((state) => state.mode);
  const clientName = useWorkspaceStore((state) => state.clientName);
  const workspaceTitle = useWorkspaceStore((state) => state.workspaceTitle);

  if (activeWindow) {
    const label = activeClientName ? `${activeWindow.title} · ${activeClientName}` : activeWindow.title;
    return (
      <div className="olivia-chat-context-banner">
        <button type="button" onClick={() => focusWindow(activeWindow.id)}>
          ● {label}
        </button>
      </div>
    );
  }
  if (mode !== "split" || !type) return null;
  const entry = workspaceRegistry[type];
  if (!entry) return null;

  const label = workspaceTitle || `${clientName ? `${clientName} ` : ""}${entry.label}`;

  return (
    <div className="olivia-chat-context-banner">
      <span>현재 작업 · {label}</span>
      <button type="button" onClick={() => executeOliviaAction({ type: "ENTER_FULLSCREEN" })}>
        전체화면으로 열기
      </button>
    </div>
  );
}
