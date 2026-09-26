"use client";

import dynamic from "next/dynamic";
import { PcrmHeaderActionsProvider } from "@/components/pcrm/PcrmHeaderActionsSlot";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";
import { useOliviaUiSurface, type OliviaUiSurface } from "@/lib/olivia/surfaceContext";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";

// ClientsWorkspace는 GlobalHeader를 직접 그리지 않는다. standalone route의 (client-hub)
// layout만 헤더를 그리고, workspace는 usePcrmHeaderActions()로 검색/등록 버튼을 standalone
// 헤더 쪽에 전달한다. 창 안에서는 ClientsWorkspace가 같은 JSX를 고정 상단바에 직접 렌더하므로
// 이 Provider는 독립 URL과 창 양쪽이 같은 액션 소스를 공유하도록 유지한다.
const ClientsWorkspace = dynamic(() => import("@/components/clients/ClientsWorkspace"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>고객관리를 준비하는 중...</div>,
});

export function ClientsWindowContent({
  context,
  surface,
}: {
  context?: WindowContext;
  surface?: OliviaUiSurface;
}) {
  const inheritedSurface = useOliviaUiSurface();
  const resolvedSurface = surface ?? inheritedSurface;

  return (
    <DesktopWindowProvider value={resolvedSurface === "desktop"}>
      <PcrmHeaderActionsProvider>
        <div className="olivia-os-clients-window" style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          <ClientsWorkspace
            initialClientId={context?.clientId}
            initialWorkflowRunId={context?.projectId}
            surface={resolvedSurface}
          />
        </div>
      </PcrmHeaderActionsProvider>
    </DesktopWindowProvider>
  );
}
