"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider, DesktopWindowRouteProvider } from "@/lib/desktopWindowContext";
import { useDesktopAppLauncher } from "../useDesktopAppLauncher";

const SeoDeliveryPage = dynamic(
  () => import("@/app/seo-delivery/page"),
  {
    ssr: false,
    loading: () => <div style={{ padding: 24, fontSize: 12, color: "var(--muted)" }}>SEO 납품 화면을 준비하는 중...</div>,
  },
);

export function SeoDeliveryWindowContent({ context }: { context?: WindowContext }) {
  const launchHref = useDesktopAppLauncher();
  return (
    <DesktopWindowProvider value={true}>
      <DesktopWindowRouteProvider value={{ clientId: context?.clientId, workflowRunId: context?.workflowRunId, routeHref: context?.routeHref, navigate: launchHref }}>
        <Suspense fallback={<div style={{ padding: 24, fontSize: 12, color: "var(--muted)" }}>SEO 납품 화면을 준비하는 중...</div>}>
          <SeoDeliveryPage />
        </Suspense>
      </DesktopWindowRouteProvider>
    </DesktopWindowProvider>
  );
}
