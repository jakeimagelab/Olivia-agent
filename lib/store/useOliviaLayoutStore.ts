import { create } from "zustand";
import type { OliviaLayoutMode } from "@/lib/olivia/v2/types";

type OliviaLayoutState = {
  mode: OliviaLayoutMode;
  previousMode?: OliviaLayoutMode;
  chatFocused: boolean;
  workspaceFocused: boolean;
  drawerOpen: boolean;
  startConversation: () => void;
  openWorkspaceMode: () => void;
  closeWorkspaceMode: () => void;
  expandWorkspaceChat: () => void;
  collapseWorkspaceChat: () => void;
  setChatFocused: (focused: boolean) => void;
  setWorkspaceFocused: (focused: boolean) => void;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  setDrawerOpen: (open: boolean) => void;
  resetToIdle: () => void;
};

export const useOliviaLayoutStore = create<OliviaLayoutState>((set, get) => ({
  mode: "idle",
  previousMode: undefined,
  chatFocused: false,
  workspaceFocused: false,
  drawerOpen: false,
  startConversation: () => set((state) => state.mode === "idle" ? { mode: "conversation" } : state),
  openWorkspaceMode: () => set((state) => ({
    mode: "workspace",
    previousMode: state.mode === "idle" ? "idle" : "conversation",
    drawerOpen: false,
  })),
  closeWorkspaceMode: () => set((state) => ({
    mode: state.previousMode === "idle" ? "idle" : "conversation",
    previousMode: undefined,
    drawerOpen: false,
    workspaceFocused: false,
  })),
  expandWorkspaceChat: () => set((state) => state.mode === "workspace" ? { mode: "workspace-chat-expanded" } : state),
  collapseWorkspaceChat: () => set((state) => state.mode === "workspace-chat-expanded" ? { mode: "workspace" } : state),
  setChatFocused: (focused) => set({ chatFocused: focused, ...(focused ? { workspaceFocused: false } : {}) }),
  setWorkspaceFocused: (focused) => set({ workspaceFocused: focused, ...(focused ? { chatFocused: false } : {}) }),
  enterFullscreen: () => {
    const mode = get().mode;
    if (mode === "workspace" || mode === "workspace-chat-expanded") {
      set({ previousMode: mode, mode: "fullscreen", drawerOpen: false });
    }
  },
  exitFullscreen: () => set((state) => ({ mode: state.previousMode === "workspace-chat-expanded" ? "workspace-chat-expanded" : "workspace", drawerOpen: false })),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  resetToIdle: () => set({ mode: "idle", previousMode: undefined, chatFocused: false, workspaceFocused: false, drawerOpen: false }),
}));

// 스트리밍/포커스에 따라 비율이 수시로 바뀌던 이전 동작은 사용자가 "레이아웃이 자꾸
// 움직인다"고 명시적으로 신고해(2026-08-30) 제거했다 — 이제 워크스페이스 화면(견적서 등)은
// 항상 70%, 채팅은 항상 30%로 고정한다. "대화 크게" 버튼(workspace-chat-expanded, 사용자가
// 직접 클릭해야만 들어가는 모드)만 예외로 남겨둔다 — 이건 자동 변동이 아니라 명시적 조작이다.
export function getWorkspaceLayoutWeight(input: {
  mode: OliviaLayoutMode;
  chatFocused: boolean;
  workspaceFocused: boolean;
  streaming: boolean;
}) {
  if (input.mode === "workspace-chat-expanded") return { chat: 0.62, workspace: 0.38 };
  return { chat: 0.3, workspace: 0.7 };
}
