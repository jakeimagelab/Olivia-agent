"use client";

import dynamic from "next/dynamic";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

const PortraitConsentApp = dynamic(() => import("@/components/portrait-consent/PortraitConsentApp"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>초상권 동의서를 준비하는 중...</div>,
});

export function PortraitConsentWindowContent({ context }: { context?: WindowContext }) {
  return <DesktopWindowProvider value={true}><PortraitConsentApp clientId={context?.clientId} workflowRunId={context?.projectId} /></DesktopWindowProvider>;
}
