"use client";

import dynamic from "next/dynamic";
import { PcrmHeaderActionsProvider } from "@/components/pcrm/PcrmHeaderActionsSlot";

// app/(client-hub)/clients/page.tsx(ClientsPage)도 GlobalHeader를 직접 그리지 않는다 —
// (client-hub)/layout.tsx가 그린다. page.tsx는 usePcrmHeaderActions()만 호출해 검색/등록
// 버튼을 그 헤더 쪽으로 밀어넣는데, 이 훅은 Provider가 없어도 optional chaining이라 에러 없이
// no-op된다(components/pcrm/PcrmHeaderActionsSlot.tsx 확인). 그래도 정상적인 사용법을 따라
// Provider로 한 번 감싼다 — 창 안에는 그 액션을 렌더할 헤더가 없으므로 그냥 조용히 버려진다.
const ClientsPage = dynamic(() => import("@/app/(client-hub)/clients/page"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>고객관리를 준비하는 중...</div>,
});

export function ClientsWindowContent() {
  return (
    <PcrmHeaderActionsProvider>
      <ClientsPage />
    </PcrmHeaderActionsProvider>
  );
}
