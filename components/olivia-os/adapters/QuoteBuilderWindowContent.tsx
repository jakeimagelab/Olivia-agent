"use client";

import dynamic from "next/dynamic";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";

// QuoteBuilder는 이미 mode="modal"로 GlobalHeader 없이 렌더되는 경로를 갖고 있다(고객관리
// 견적 모달에서 실사용 중) — 그 경로를 그대로 재사용한다. "견적서 열어줘"가 ComingSoonPlaceholder
// 대신 실제로 쓸 수 있는 화면을 열게 한다(Phase 3 §41, no fake completion).
// 알려진 한계: OpenAppInput이 clientId/resourceId를 아직 안 실어 나르므로(§42 targetWindowId류
// 확장은 이번 phase 범위 밖), 지금은 항상 빈 새 견적서로 열린다 — 특정 고객/문서로 바로 열리게
// 하려면 useOliviaDesktopStore.openApp의 입력을 확장하는 후속 작업이 필요하다.
const QuoteBuilder = dynamic(() => import("@/components/quote/QuoteBuilder"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>견적서를 준비하는 중...</div>,
});

export function QuoteBuilderWindowContent({ context }: { context?: WindowContext }) {
  return <QuoteBuilder mode="modal" clientId={context?.clientId} workflowRunId={context?.projectId} resourceId={context?.resourceId} />;
}
