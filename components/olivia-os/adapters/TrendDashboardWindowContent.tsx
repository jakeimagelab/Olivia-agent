"use client";

import dynamic from "next/dynamic";
import { AnalysisHostProvider } from "@/components/analysis-workspace/AnalysisHostContext";

const TrendDashboardPage = dynamic(() => import("@/app/trend-dashboard/page"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "#5a7470", fontSize: 12 }}>트렌드 분석을 준비하는 중...</div>,
});

export function TrendDashboardWindowContent() {
  return <AnalysisHostProvider surface="window"><TrendDashboardPage /></AnalysisHostProvider>;
}
