"use client";

import { useEffect, useRef } from "react";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";

// OLIVIA OS Phase 3 — Desktop Store(어떤 창이 떠 있고 어떤 게 포커스인지)와 기존
// useOliviaContextStore(서버로 전송되는 LLM 컨텍스트, lib/store/oliviaContextStore.ts)를
// 잇는 유일한 다리. 두 store를 직접 강결합하지 않기 위해 이 hook 하나만 양쪽을 안다 — Desktop
// Store 자체는 여전히 비즈니스 로직을 모른다.
//
// 새 store 필드를 만들지 않고 기존 setWorkspace(workspace, resourceId)에 얹는다 —
// getOliviaContextSnapshot/buildOliviaPageContext가 이미 activeWorkspace를 서버로 보내고
// 있으므로, LLM이 "지금 사진작업실을 보고 있다"를 알려면 이 값만 채우면 충분하다.
const DESKTOP_APP_TO_WORKSPACE: Partial<Record<string, string>> = {
  "photo-workspace": "photo-sort",
  quote: "quote",
  contract: "contract",
  conti: "conti",
  calendar: "calendar",
};

export function useOliviaDesktopContextBridge() {
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const activeAppId = useOliviaDesktopStore((state) => (
    state.activeWindowId ? state.windows[state.activeWindowId]?.appId ?? null : null
  ));
  const customerWindowOpen = useOliviaDesktopStore((state) => Boolean(state.windows.customer));
  const wasCustomerOpen = useRef(false);

  useEffect(() => {
    const mapped = activeAppId ? DESKTOP_APP_TO_WORKSPACE[activeAppId] : undefined;
    useOliviaContextStore.getState().setWorkspace(mapped, undefined);
  }, [activeAppId, activeWindowId]);

  // 고객관리 창이 실제로 닫힐 때만(포커스만 잃는 것과 구분) activeClientId를 정리한다 —
  // 대화 연속성을 위해 창을 전환하는 것만으로는 지우지 않는다(스펙 §25/§45).
  useEffect(() => {
    if (customerWindowOpen) { wasCustomerOpen.current = true; return; }
    if (wasCustomerOpen.current) {
      wasCustomerOpen.current = false;
      useOliviaContextStore.getState().setClient(undefined, undefined);
    }
  }, [customerWindowOpen]);
}
