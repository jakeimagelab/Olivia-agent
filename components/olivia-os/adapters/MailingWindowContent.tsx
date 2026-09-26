"use client";

import dynamic from "next/dynamic";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { DesktopWindowProvider, DesktopWindowRouteProvider } from "@/lib/desktopWindowContext";

const MailingPage = dynamic(
  () => import("@/app/mailing/page"),
  {
    ssr: false,
    loading: () => <div style={{ padding: 24, fontSize: 12, color: "var(--muted)" }}>메일링을 준비하는 중...</div>,
  },
);

export function MailingWindowContent({ context }: { context?: WindowContext }) {
  return (
    <DesktopWindowProvider value={true}>
      <DesktopWindowRouteProvider value={{ clientId: context?.clientId, routeHref: context?.routeHref }}>
        <MailingPage />
      </DesktopWindowRouteProvider>
    </DesktopWindowProvider>
  );
}
