"use client";

import dynamic from "next/dynamic";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";

const WorkJournalPage = dynamic(
  () => import("@/app/work-journal/page"),
  {
    ssr: false,
    loading: () => <div style={{ padding: 24, fontSize: 12, color: "var(--muted)" }}>업무일지를 준비하는 중...</div>,
  },
);

export function WorkJournalWindowContent() {
  return (
    <DesktopWindowProvider value={true}>
      <WorkJournalPage />
    </DesktopWindowProvider>
  );
}
