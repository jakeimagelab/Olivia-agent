"use client";

import dynamic from "next/dynamic";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

const ContiWorkspaceAdapter = dynamic(() => import("@/components/conti/v2/ContiWorkspaceAdapter"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 12, color: "#5A7470" }}>콘티를 준비하는 중...</div>,
});

export function ContiWindowContent({ context }: { context?: WindowContext }) {
  return <DesktopWindowProvider value={true}><ContiWorkspaceAdapter clientId={context?.clientId} workflowRunId={context?.projectId} resourceId={context?.resourceId} /></DesktopWindowProvider>;
}
