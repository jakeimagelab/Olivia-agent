"use client";

import dynamic from "next/dynamic";

// QuoteBuilderWindowContent.tsx와 동일한 이유 — mode="modal" 경로(작은 pc-header, GlobalHeader
// 없음)를 그대로 재사용한다. 알려진 한계도 동일: clientId/resourceId 연결은 이번 phase 범위 밖.
const ContractBuilder = dynamic(() => import("@/components/contract/ContractBuilder"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>계약서를 준비하는 중...</div>,
});

export function ContractBuilderWindowContent() {
  return <ContractBuilder mode="modal" />;
}
