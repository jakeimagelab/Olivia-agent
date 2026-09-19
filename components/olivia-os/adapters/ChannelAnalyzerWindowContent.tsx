"use client";

import dynamic from "next/dynamic";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { AnalysisHostProvider } from "@/components/analysis-workspace/AnalysisHostContext";

const ChannelAnalyzerPage = dynamic(() => import("@/app/channel-analyzer/page"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "#5a7470", fontSize: 12 }}>채널 분석을 준비하는 중...</div>,
});

export function ChannelAnalyzerWindowContent({ context }: { context?: WindowContext }) {
  return (
    <AnalysisHostProvider surface="window" windowContext={context}>
      <ChannelAnalyzerPage />
    </AnalysisHostProvider>
  );
}
