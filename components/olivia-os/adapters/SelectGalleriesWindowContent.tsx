"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider, DesktopWindowRouteProvider } from "@/lib/desktopWindowContext";
import { useDesktopAppLauncher } from "../useDesktopAppLauncher";

const loading = <div style={{ padding: 24, fontSize: 12, color: "var(--muted)" }}>셀렉 갤러리를 준비하는 중...</div>;

const SelectGalleriesPage = dynamic(
  () => import("@/app/(client-hub)/select-galleries/page"),
  { ssr: false, loading: () => loading },
);

const SelectGalleryDetailPage = dynamic(
  () => import("@/app/(client-hub)/select-galleries/[id]/page"),
  { ssr: false, loading: () => loading },
);

export function SelectGalleriesWindowContent({ context }: { context?: WindowContext }) {
  const launchHref = useDesktopAppLauncher();
  const isDetail = context?.routeHref
    ? /^\/select-galleries\/[^/]+\/?$/.test(new URL(context.routeHref, "https://olivia.local").pathname)
    : false;
  const routeValue = {
    clientId: context?.clientId,
    workflowRunId: context?.workflowRunId,
    routeHref: context?.routeHref,
    navigate: launchHref,
  };

  return (
    <DesktopWindowProvider value={true}>
      <DesktopWindowRouteProvider value={routeValue}>
        <Suspense fallback={loading}>
          {isDetail ? <SelectGalleryDetailPage /> : <SelectGalleriesPage />}
        </Suspense>
      </DesktopWindowRouteProvider>
    </DesktopWindowProvider>
  );
}
