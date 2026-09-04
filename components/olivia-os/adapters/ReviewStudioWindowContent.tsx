"use client";

import dynamic from "next/dynamic";
import { PcrmHeaderActionsProvider } from "@/components/pcrm/PcrmHeaderActionsSlot";

// ClientsWindowContent.tsx와 동일한 이유로 동일한 패턴 — review-studio도 (client-hub) 라우트
// 그룹이라 layout.tsx가 GlobalHeader/PcrmSubNav를 그리고, page.tsx는 usePcrmHeaderActions()만
// 쓴다. dynamic()으로 page 모듈만 가져오면 layout이 안 딸려오므로 헤더 중복이 없다.
const ReviewStudioPage = dynamic(() => import("@/app/(client-hub)/review-studio/page"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>리뷰콘텐츠를 준비하는 중...</div>,
});

export function ReviewStudioWindowContent() {
  return (
    <PcrmHeaderActionsProvider>
      <ReviewStudioPage />
    </PcrmHeaderActionsProvider>
  );
}
