"use client";

import dynamic from "next/dynamic";

// QuoteBuilderWindowContent.tsx와 동일한 이유 — mode="modal" 경로를 그대로 재사용한다.
// 알려진 한계도 동일: clientId/resourceId 연결은 이번 phase 범위 밖.
const ContiBuilder = dynamic(() => import("@/components/conti/ContiBuilder"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>콘티를 준비하는 중...</div>,
});

export function ContiBuilderWindowContent() {
  return <ContiBuilder mode="modal" />;
}
