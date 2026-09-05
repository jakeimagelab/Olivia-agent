"use client";

import dynamic from "next/dynamic";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

// QuoteBuilderWindowContent.tsx와 동일한 이유 — mode="modal" 경로를 그대로 재사용한다.
// 알려진 한계도 동일: clientId/resourceId 연결은 이번 phase 범위 밖.
// DesktopWindowProvider: ClientsWorkspace.tsx의 기존 콘티 툴 모달과 mode="modal"을 공유하므로,
// OS 창인지 구분하는 용도(OLIVIA OS 1차 작업 지시서 4단계 3단 레이아웃을 OS 창에만 적용).
const ContiBuilder = dynamic(() => import("@/components/conti/ContiBuilder"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>콘티를 준비하는 중...</div>,
});

export function ContiBuilderWindowContent({ context }: { context?: WindowContext }) {
  return (
    <DesktopWindowProvider value={true}>
      <ContiBuilder mode="modal" clientId={context?.clientId} workflowRunId={context?.projectId} resourceId={context?.resourceId} />
    </DesktopWindowProvider>
  );
}
