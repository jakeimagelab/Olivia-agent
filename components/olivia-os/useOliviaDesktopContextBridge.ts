"use client";

import { useEffect, useRef } from "react";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useOliviaDesktopEffectiveActiveApp } from "./useOliviaDesktopEffectiveActiveApp";

// OLIVIA OS Phase 3 — Desktop Store(어떤 창이 떠 있고 어떤 게 포커스인지)와 기존
// useOliviaContextStore(서버로 전송되는 LLM 컨텍스트, lib/store/oliviaContextStore.ts)를
// 잇는 유일한 다리. 두 store를 직접 강결합하지 않기 위해 이 hook 하나만 양쪽을 안다 — Desktop
// Store 자체는 여전히 비즈니스 로직을 모른다.
//
// 새 store 필드를 만들지 않고 기존 setWorkspace(workspace, resourceId)에 얹는다 —
// getOliviaContextSnapshot/buildOliviaPageContext가 이미 activeWorkspace를 서버로 보내고
// 있으므로, LLM이 "지금 사진작업실을 보고 있다"를 알려면 이 값만 채우면 충분하다.
// export된 이유: 이 매핑 테이블 자체는 순수 데이터라 유닛 테스트로 직접 검증 가능하다
// (hook 본체는 React 렌더링이 필요해 이 repo의 node 환경 Vitest로는 직접 테스트하지 않고
// 브라우저 QA로 검증한다 — tests/oliviaDesktopContextBridge.test.ts 참고).
export const DESKTOP_APP_TO_WORKSPACE: Partial<Record<string, string>> = {
  "photo-workspace": "photo-sort",
  quote: "quote",
  contract: "contract",
  conti: "conti",
  calendar: "calendar",
};

export function useOliviaDesktopContextBridge() {
  // Olivia 채팅창 자체에 포커스가 가 있어도(입력 중) "직전에 보고 있던 앱"을 계속 컨텍스트로
  // 쓴다 — 안 그러면 채팅 입력창을 클릭하는 순간 activeWorkspace가 지워져서, 정작 채팅에게
  // 물어보려던 화면의 컨텍스트가 사라진다(브라우저 QA에서 발견).
  const effective = useOliviaDesktopEffectiveActiveApp();
  const customerWindowOpen = useOliviaDesktopStore((state) => Boolean(state.windows.customer));
  const wasCustomerOpen = useRef(false);

  const effectiveAppId = effective?.appId;
  useEffect(() => {
    const mapped = effectiveAppId ? DESKTOP_APP_TO_WORKSPACE[effectiveAppId] : undefined;
    useOliviaContextStore.getState().setWorkspace(mapped, undefined);
  }, [effectiveAppId]);

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
