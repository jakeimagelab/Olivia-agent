import { create } from "zustand";

// 홈 대시보드는 useOliviaLayoutStore(idle/conversation/workspace/workspace-chat-expanded/fullscreen)를
// 그대로 쓴다 — 그 스토어는 DynamicWorkspace의 body 포털/전체화면과 얽혀 있어 재사용하면 리스크만
// 커진다. 이 스토어는 그 외 모든 페이지(고객관리/일정/갤러리/견적 등)의 영구 채팅 패널 전용이다.
export type OliviaChatMode = "expanded" | "normal" | "compact" | "minimized";

type OliviaChatModeState = {
  chatMode: OliviaChatMode;
  previousChatMode: OliviaChatMode;
  isChatFocused: boolean;
  isWorkspaceFocused: boolean;
  hasUnread: boolean;
  modalOpenCount: number;
  expandChat: () => void;
  normalizeChat: () => void;
  compactChat: () => void;
  minimizeChat: () => void;
  restoreChat: () => void;
  toggleChat: () => void;
  setChatFocused: (focused: boolean) => void;
  setWorkspaceFocused: (focused: boolean) => void;
  markUnread: () => void;
  clearUnread: () => void;
  registerModalOpen: () => void;
  registerModalClose: () => void;
};

function setMode(get: () => OliviaChatModeState, mode: OliviaChatMode) {
  const current = get().chatMode;
  if (current === mode) return {};
  return { chatMode: mode, previousChatMode: current };
}

export const useOliviaChatModeStore = create<OliviaChatModeState>((set, get) => ({
  chatMode: "minimized",
  previousChatMode: "normal",
  isChatFocused: false,
  isWorkspaceFocused: false,
  hasUnread: false,
  modalOpenCount: 0,
  expandChat: () => set(setMode(get, "expanded")),
  normalizeChat: () => set(setMode(get, "normal")),
  compactChat: () => set(setMode(get, "compact")),
  minimizeChat: () => set(setMode(get, "minimized")),
  restoreChat: () => set((state) => ({
    chatMode: state.previousChatMode === "minimized" ? "normal" : state.previousChatMode,
    hasUnread: false,
  })),
  toggleChat: () => set((state) => state.chatMode === "minimized"
    ? { chatMode: state.previousChatMode === "minimized" ? "normal" : state.previousChatMode, hasUnread: false }
    : { chatMode: "minimized", previousChatMode: state.chatMode }),
  setChatFocused: (focused) => set({ isChatFocused: focused, ...(focused ? { isWorkspaceFocused: false } : {}) }),
  setWorkspaceFocused: (focused) => set({ isWorkspaceFocused: focused, ...(focused ? { isChatFocused: false } : {}) }),
  markUnread: () => set((state) => state.chatMode === "minimized" ? { hasUnread: true } : {}),
  clearUnread: () => set({ hasUnread: false }),
  // 견적서/콘티 빌더가 모달로 열리면(width:94vw) 화면 대부분을 덮는다. 호출형 채팅은
  // 모달이 닫혀도 자동 재개하지 않고 사용자가 Olivia 아이콘을 눌렀을 때만 연다.
  registerModalOpen: () => set((state) => {
    const modalOpenCount = state.modalOpenCount + 1;
    if (modalOpenCount === 1 && state.chatMode !== "minimized") {
      return { modalOpenCount, chatMode: "minimized", previousChatMode: state.chatMode };
    }
    return { modalOpenCount };
  }),
  registerModalClose: () => set((state) => {
    const modalOpenCount = Math.max(0, state.modalOpenCount - 1);
    return { modalOpenCount };
  }),
}));

export const OLIVIA_CHAT_MODE_WIDTH: Record<OliviaChatMode, string> = {
  expanded: "clamp(480px, 42vw, 640px)",
  normal: "clamp(360px, 28vw, 460px)",
  compact: "300px",
  minimized: "60px",
};
