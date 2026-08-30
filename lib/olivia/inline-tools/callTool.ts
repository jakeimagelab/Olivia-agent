"use client";

import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { getOliviaContextSnapshot } from "@/lib/store/oliviaContextStore";

// 견적서 마법사 인라인 카드(QuoteSetupForm/QuoteDiscountForm/QuoteClientRegistrationChatCard)가
// 폼 제출/버튼 클릭으로 이미 알고 있는 도구를 GPT 왕복 없이 곧장 실행할 때 쓰는 공유 헬퍼다.
// useOliviaConversationStore.ts의 approveAction()과 정확히 같은 fetch+uiActions 처리 패턴이지만
// /api/olivia/v2/approve(승인 카드 확인 버튼 전용, APPROVABLE_TOOLS allowlist)가 아니라
// /api/olivia/v2/inline-tool-action(인라인 카드 전용, INLINE_CARD_TOOLS allowlist)을 호출한다
// — 두 allowlist의 의미론을 섞지 않기 위해서다(견적서 UX 개편, 2026-08-31).
export async function callOliviaTool(toolName: string, toolInput: Record<string, unknown>) {
  const pathname = typeof location !== "undefined" ? location.pathname : undefined;
  const response = await fetch("/api/olivia/v2/inline-tool-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName, toolInput, context: getOliviaContextSnapshot(pathname) }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "작업에 실패했어요.");
  for (const action of payload.uiActions || []) executeOliviaAction(action);
  return { result: payload.result as Record<string, unknown> | undefined, uiActions: payload.uiActions as unknown[] };
}
