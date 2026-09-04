"use client";

import { useEffect, useRef } from "react";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";

// OLIVIA OS Phase 3 — Olivia 채팅창 자신에 포커스가 가면(입력창을 클릭하는 순간 등)
// activeWindowId가 "olivia-chat"이 되어, context 배너/제안이 "지금 보고 있는 앱: Olivia"처럼
// 순환적이고 의미 없는 값을 보여주는 문제가 있었다(브라우저 QA에서 발견). "마지막으로
// 포커스됐던 olivia-chat이 아닌 창"을 별도로 기억해서, 이 값을 배너(OliviaChatContextBanner)/
// 제안(OliviaConversation)/Context Bridge(useOliviaDesktopContextBridge) 세 곳이 공통으로
// 쓴다 — 셋 다 각자 구현하면 로직이 흩어진다.
export function useOliviaDesktopEffectiveActiveApp(): { windowId: string; appId: string } | null {
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const activeAppId = useOliviaDesktopStore((state) => (
    state.activeWindowId ? state.windows[state.activeWindowId]?.appId ?? null : null
  ));
  const lastRef = useRef<{ windowId: string; appId: string } | null>(null);

  useEffect(() => {
    if (activeWindowId && activeAppId && activeAppId !== "olivia-chat") {
      lastRef.current = { windowId: activeWindowId, appId: activeAppId };
    } else if (!activeWindowId) {
      // 아무 창도 없으면(전부 닫힘/최소화) 더 이상 유효하지 않은 이전 값도 지운다.
      lastRef.current = null;
    }
  });

  if (activeAppId && activeAppId !== "olivia-chat") return { windowId: activeWindowId as string, appId: activeAppId };
  return lastRef.current;
}
