"use client";

import dynamic from "next/dynamic";
import { AnalysisHostProvider } from "@/components/analysis-workspace/AnalysisHostContext";

const HospitalBrandImageDiagnosisPage = dynamic(() => import("@/app/hospital-brand-image-diagnosis/page"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "#5a7470", fontSize: 12 }}>브랜드 이미지 진단을 준비하는 중...</div>,
});

export function HospitalBrandDiagnosisWindowContent() {
  return <AnalysisHostProvider surface="window"><HospitalBrandImageDiagnosisPage /></AnalysisHostProvider>;
}
