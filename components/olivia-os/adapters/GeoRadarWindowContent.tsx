"use client";

import dynamic from "next/dynamic";
import { AnalysisHostProvider } from "@/components/analysis-workspace/AnalysisHostContext";

const GeoRadarPage = dynamic(() => import("@/app/geo-radar/page"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "#617565", fontSize: 13 }}>GEO 레이더를 준비하는 중...</div>,
});

export function GeoRadarWindowContent() {
  return <AnalysisHostProvider surface="window"><GeoRadarPage /></AnalysisHostProvider>;
}
