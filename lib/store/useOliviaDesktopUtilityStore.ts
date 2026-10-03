"use client";

import { create } from "zustand";

/**
 * Desktop shell only UI state.  This deliberately does not own messages, jobs, or
 * any application data: search and mini-chat are alternate entry points to the
 * existing desktop/conversation stores.
 */
type DesktopUtilityNotice = {
  id: number;
  message: string;
  tone: "info" | "error";
};

type OliviaDesktopUtilityState = {
  globalSearchOpen: boolean;
  miniChatOpen: boolean;
  captureInProgress: boolean;
  notice: DesktopUtilityNotice | null;
  setGlobalSearchOpen: (open: boolean) => void;
  setMiniChatOpen: (open: boolean) => void;
  toggleMiniChat: () => void;
  setCaptureInProgress: (inProgress: boolean) => void;
  showNotice: (message: string, tone?: DesktopUtilityNotice["tone"]) => void;
  clearNotice: (id?: number) => void;
};

let noticeId = 0;

export const useOliviaDesktopUtilityStore = create<OliviaDesktopUtilityState>((set, get) => ({
  globalSearchOpen: false,
  miniChatOpen: false,
  captureInProgress: false,
  notice: null,
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),
  setMiniChatOpen: (open) => set({ miniChatOpen: open }),
  toggleMiniChat: () => set({ miniChatOpen: !get().miniChatOpen }),
  setCaptureInProgress: (captureInProgress) => set({ captureInProgress }),
  showNotice: (message, tone = "info") => set({ notice: { id: ++noticeId, message, tone } }),
  clearNotice: (id) => set((state) => !state.notice || (id !== undefined && state.notice.id !== id)
    ? state
    : { notice: null }),
}));
