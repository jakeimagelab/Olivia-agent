"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider, DesktopWindowRouteProvider } from "@/lib/desktopWindowContext";
import { useDesktopAppLauncher } from "../useDesktopAppLauncher";

const loading = <div style={{ padding: 24, color: "var(--muted)" }}>개인별 사진 셀렉을 준비하는 중...</div>;
const ListPage = dynamic(() => import("@/app/(client-hub)/person-select/page"), { ssr: false, loading: () => loading });
const DetailPage = dynamic(() => import("@/app/(client-hub)/person-select/[id]/page"), { ssr: false, loading: () => loading });

export function PersonSelectWindowContent({ context }: { context?: WindowContext }) {
  const navigate = useDesktopAppLauncher();
  const detail = context?.routeHref ? /^\/person-select\/[^/]+\/?$/.test(new URL(context.routeHref, "https://olivia.local").pathname) : false;
  return <DesktopWindowProvider value={true}><DesktopWindowRouteProvider value={{ routeHref: context?.routeHref, clientId: context?.clientId, workflowRunId: context?.workflowRunId, navigate }}><Suspense fallback={loading}>{detail ? <DetailPage /> : <ListPage />}</Suspense></DesktopWindowRouteProvider></DesktopWindowProvider>;
}
