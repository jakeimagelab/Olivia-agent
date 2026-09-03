"use client";

import dynamic from "next/dynamic";

// components/photo-workspace/PhotoWorkspace.tsx는 GlobalHeader를 직접 그리지 않는다(탭 콘텐츠만
// 그린다 — (photo-studio)/layout.tsx가 헤더를 그린다) — 그래서 그대로 마운트해도 헤더가 겹치지
// 않는다. PhotoWorkspace.tsx 자신도 raw-select/photo-retouching 등을 이 방식(dynamic import한
// page.tsx)으로 이미 쓰고 있다 — 같은 관례를 그대로 따른다.
const PhotoWorkspace = dynamic(() => import("@/components/photo-workspace/PhotoWorkspace"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>사진작업실을 준비하는 중...</div>,
});

export function PhotoWorkspaceWindowContent() {
  return <PhotoWorkspace />;
}
