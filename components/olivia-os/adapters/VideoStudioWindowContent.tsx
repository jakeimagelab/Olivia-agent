"use client";

import dynamic from "next/dynamic";
import PhotoStudioExecutionBar from "@/components/photo-workspace/PhotoStudioExecutionBar";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

// 영상작업실은 사진작업실과 같은 "작업 위치" 막대(Mac Studio 상태 표시)를 그대로 쓴다.
const VideoStudio = dynamic(() => import("@/components/video-studio/VideoStudio"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>영상작업실을 준비하는 중...</div>,
});

export function VideoStudioWindowContent() {
  return (
    <DesktopWindowProvider value={true}>
      <PhotoStudioExecutionProvider>
        <PhotoStudioExecutionBar />
        <VideoStudio />
      </PhotoStudioExecutionProvider>
    </DesktopWindowProvider>
  );
}
