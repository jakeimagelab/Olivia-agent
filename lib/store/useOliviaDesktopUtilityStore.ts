"use client";

import { create } from "zustand";

/**
 * Desktop shell only UI state.  This deliberately does not own messages, jobs, or
 * any application data: search and compact chat are presentation controls for
 * the existing desktop/conversation stores.
 */
type DesktopUtilityNotice = {
  id: number;
  message: string;
  tone: "info" | "error";
};

type OliviaDesktopUtilityState = {
  globalSearchOpen: boolean;
  chatCompact: boolean;
  captureInProgress: boolean;
  notice: DesktopUtilityNotice | null;
  setGlobalSearchOpen: (open: boolean) => void;
  setChatCompact: (compact: boolean) => void;
  toggleChatCompact: () => void;
  setCaptureInProgress: (inProgress: boolean) => void;
  showNotice: (message: string, tone?: DesktopUtilityNotice["tone"]) => void;
  clearNotice: (id?: number) => void;
};

let noticeId = 0;

export const useOliviaDesktopUtilityStore = create<OliviaDesktopUtilityState>((set, get) => ({
  globalSearchOpen: false,
  chatCompact: false,
  captureInProgress: false,
  notice: null,
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),
  setChatCompact: (chatCompact) => set({ chatCompact }),
  toggleChatCompact: () => set({ chatCompact: !get().chatCompact }),
  setCaptureInProgress: (captureInProgress) => set({ captureInProgress }),
  showNotice: (message, tone = "info") => set({ notice: { id: ++noticeId, message, tone } }),
  clearNotice: (id) => set((state) => !state.notice || (id !== undefined && state.notice.id !== id)
    ? state
    : { notice: null }),
}));
