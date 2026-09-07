"use client";

import dynamic from "next/dynamic";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

// 검증용 신규 콘티 시스템 — ContiBuilderWindowContent.tsx(기존 콘티 스튜디오)와 별개 창.
// 확인되면 oliviaAppRegistry의 "conti" 항목을 이걸로 교체하고 이 임시 항목은 지운다.
const ContiV2App = dynamic(() => import("@/components/conti/v2/ContiV2App"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>콘티(신규)를 준비하는 중...</div>,
});

export function ContiV2WindowContent() {
  return (
    <DesktopWindowProvider value={true}>
      <ContiV2App />
    </DesktopWindowProvider>
  );
}
