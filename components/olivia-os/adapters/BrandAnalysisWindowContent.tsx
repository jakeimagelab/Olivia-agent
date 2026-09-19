"use client";

import dynamic from "next/dynamic";
import { AnalysisHostProvider } from "@/components/analysis-workspace/AnalysisHostContext";

const BrandAnalysisPage = dynamic(() => import("@/app/brand-analysis/page"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "#5a7470", fontSize: 12 }}>브랜드 분석을 준비하는 중...</div>,
});

export function BrandAnalysisWindowContent() {
  return <AnalysisHostProvider surface="window"><BrandAnalysisPage /></AnalysisHostProvider>;
}
