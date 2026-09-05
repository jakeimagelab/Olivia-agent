"use client";

import dynamic from "next/dynamic";
import { PcrmHeaderActionsProvider } from "@/components/pcrm/PcrmHeaderActionsSlot";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";

// ClientsWorkspace는 GlobalHeader를 직접 그리지 않는다. standalone route의 (client-hub)
// layout만 헤더를 그리고, workspace는 usePcrmHeaderActions()로 검색/등록
// 버튼을 그 헤더 쪽으로 밀어넣는데, 이 훅은 Provider가 없어도 optional chaining이라 에러 없이
// no-op된다(components/pcrm/PcrmHeaderActionsSlot.tsx 확인). 그래도 정상적인 사용법을 따라
// Provider로 한 번 감싼다 — 창 안에는 그 액션을 렌더할 헤더가 없으므로 그냥 조용히 버려진다.
const ClientsWorkspace = dynamic(() => import("@/components/clients/ClientsWorkspace"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>고객관리를 준비하는 중...</div>,
});

export function ClientsWindowContent({ context }: { context?: WindowContext }) {
  return (
    <DesktopWindowProvider value={true}>
      <PcrmHeaderActionsProvider>
        <div className="olivia-os-clients-window" style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          <ClientsWorkspace initialClientId={context?.clientId} initialWorkflowRunId={context?.projectId} />
        </div>
      </PcrmHeaderActionsProvider>
    </DesktopWindowProvider>
  );
}
