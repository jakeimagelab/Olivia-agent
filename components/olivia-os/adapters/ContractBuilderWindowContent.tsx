"use client";

import dynamic from "next/dynamic";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

// QuoteBuilderWindowContent.tsx와 동일하게 mode="modal" 경로를 재사용한다. 기존 계약서를
// 여는 resourceId와, 견적에서 새 계약서를 시작하는 sourceQuoteId는 서로 다른 의미로 전달한다.
const ContractBuilder = dynamic(() => import("@/components/contract/ContractBuilder"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>계약서를 준비하는 중...</div>,
});

export function ContractBuilderWindowContent({ context }: { context?: WindowContext }) {
  return (
    <DesktopWindowProvider value={true}>
      <ContractBuilder
        mode="modal"
        clientId={context?.clientId}
        workflowRunId={context?.workflowRunId ?? context?.projectId}
        resourceId={context?.resourceId}
        sourceQuoteId={context?.sourceQuoteId}
      />
    </DesktopWindowProvider>
  );
}
