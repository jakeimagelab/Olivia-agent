"use client";

import dynamic from "next/dynamic";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

const VideoProductionWorkspace = dynamic(
  () => import("@/components/video-production/VideoProductionWorkspace").then((module) => module.VideoProductionWorkspace),
  {
    ssr: false,
    loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>영상제작을 준비하는 중...</div>,
  },
);

/** Olivia OS 창 안에서도 직접 React 화면을 렌더한다. Legacy iframe 경로를 사용하지 않는다. */
export function VideoProductionWindowContent() {
  return <DesktopWindowProvider value={true}><VideoProductionWorkspace embedded /></DesktopWindowProvider>;
}
