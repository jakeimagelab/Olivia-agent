"use client";

import { useCallback } from "react";
import QuoteBuilder from "@/components/quote/QuoteBuilder";
import { useOliviaDesktopStore, type WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

// QuoteBuilder는 이미 mode="modal"로 GlobalHeader 없이 렌더되는 경로를 갖고 있다(고객관리
// 견적 모달에서 실사용 중) — 그 경로를 그대로 재사용한다. "견적서 열어줘"가 ComingSoonPlaceholder
// 대신 실제로 쓸 수 있는 화면을 열게 한다(Phase 3 §41, no fake completion).
// 알려진 한계: OpenAppInput이 clientId/resourceId를 아직 안 실어 나르므로(§42 targetWindowId류
// 확장은 이번 phase 범위 밖), 지금은 항상 빈 새 견적서로 열린다 — 특정 고객/문서로 바로 열리게
// 하려면 useOliviaDesktopStore.openApp의 입력을 확장하는 후속 작업이 필요하다.
export function QuoteBuilderWindowContent({ context }: { context?: WindowContext }) {
  const updateWindowContext = useOliviaDesktopStore((state) => state.updateWindowContext);
  const quoteResourceId = context?.contextScope === "document" && context?.documentType === "quote"
    ? context.documentId ?? context.resourceId
    : undefined;
  const explicitClient = context?.contextScope === "client" && context.launchIntent === "client-new";
  const handleTargetVerified = useCallback((target: {
    quoteId: string | null;
    clientId: string | null;
    clientName?: string;
    workflowRunId: string | null;
    documentTitle?: string;
  }) => {
    const current = useOliviaDesktopStore.getState().windows.quote?.context ?? {};
    const next: WindowContext = {
      ...current,
      contextScope: target.quoteId ? "document" : target.clientId ? "client" : "none",
      launchIntent: target.quoteId ? "document" : target.clientId ? "client-new" : "new",
      targetVerified: true,
      clientId: target.clientId ?? undefined,
      clientName: target.clientId ? target.clientName : undefined,
      projectId: target.workflowRunId ?? undefined,
      projectName: target.workflowRunId ? target.documentTitle : undefined,
      workflowRunId: target.workflowRunId ?? undefined,
      resourceId: target.quoteId ?? undefined,
      documentId: target.quoteId ?? undefined,
      documentType: target.quoteId ? "quote" : undefined,
      documentTitle: target.quoteId ? target.documentTitle : undefined,
    };
    updateWindowContext("quote", next);
  }, [updateWindowContext]);
  return (
    <DesktopWindowProvider value={true}>
      <QuoteBuilder
        mode="modal"
        clientId={explicitClient ? context?.clientId : undefined}
        workflowRunId={explicitClient ? context?.workflowRunId ?? context?.projectId : undefined}
        resourceId={quoteResourceId}
        launchIntent={context?.launchIntent}
        launchRequestId={context?.launchRequestId}
        onTargetVerified={handleTargetVerified}
      />
    </DesktopWindowProvider>
  );
}
