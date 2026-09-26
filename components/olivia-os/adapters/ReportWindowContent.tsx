"use client";

import dynamic from "next/dynamic";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

const ReportPage = dynamic(
  () => import("@/app/report/page"),
  {
    ssr: false,
    loading: () => <div style={{ padding: 24, fontSize: 12, color: "var(--muted)" }}>업무 리포트를 준비하는 중...</div>,
  },
);

export function ReportWindowContent() {
  return (
    <DesktopWindowProvider value={true}>
      <ReportPage />
    </DesktopWindowProvider>
  );
}
