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

export function getWorkspaceLayoutWeight(input: {
  mode: OliviaLayoutMode;
  chatFocused: boolean;
  workspaceFocused: boolean;
  streaming: boolean;
}) {
  if (input.mode === "workspace-chat-expanded") return { chat: 0.62, workspace: 0.38 };
  if (input.streaming || input.chatFocused) return { chat: 0.42, workspace: 0.58 };
  if (input.workspaceFocused) return { chat: 0.27, workspace: 0.73 };
  return { chat: 0.34, workspace: 0.66 };
}
