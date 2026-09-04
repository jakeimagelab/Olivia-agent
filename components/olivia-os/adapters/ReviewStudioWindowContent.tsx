"use client";

import dynamic from "next/dynamic";

// Route page가 아니라 실제 feature workspace를 직접 마운트해 page/layout CSS가 창 경계를
// 침범하지 않게 한다. standalone route도 같은 component를 계속 사용한다.
const ReviewStoryWorkspace = dynamic(() => import("@/components/reviews/ReviewStoryWorkspace"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>리뷰콘텐츠를 준비하는 중...</div>,
});

export function ReviewStudioWindowContent() {
  return <ReviewStoryWorkspace />;
}
