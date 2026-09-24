"use client";

import dynamic from "next/dynamic";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

const MetadataSelectWorkspace = dynamic(
  () => import("@/components/metadata-select/MetadataSelectWorkspace"),
  {
    ssr: false,
    loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>메타데이터 셀렉을 준비하는 중...</div>,
  },
);

export function MetadataSelectWindowContent() {
  return (
    <DesktopWindowProvider value={true}>
      <MetadataSelectWorkspace />
    </DesktopWindowProvider>
  );
}
