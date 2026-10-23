"use client";

import dynamic from "next/dynamic";

import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

const OliviaBridgeWorkspace = dynamic(() => import("@/components/olivia-bridge/OliviaBridgeWorkspace"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "#5A7470", fontSize: 12 }}>Olivia Bridge를 준비하는 중...</div>,
});

export function OliviaBridgeWindowContent() {
  return (
    <DesktopWindowProvider value={true}>
      <PhotoStudioExecutionProvider>
        <OliviaBridgeWorkspace />
      </PhotoStudioExecutionProvider>
    </DesktopWindowProvider>
  );
}
