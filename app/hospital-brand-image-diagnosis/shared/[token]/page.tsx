"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { C, FS, R } from "@/lib/theme";
import type { HospitalBrandDiagnosisReport } from "@/lib/hospitalBrandDiagnosis/types";
import { ReportView } from "@/components/hospital-brand-diagnosis/ReportView";

// 섹션 14: 팀원 공유 — 로그인 없이 토큰만으로 여는 보기 전용 리포트 화면.
// 관리자 콘솔 레이아웃(사이드바/헤더)을 감싸지 않는 독립 페이지다.
export default function SharedHospitalBrandDiagnosisPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";
  const [report, setReport] = useState<HospitalBrandDiagnosisReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/hbd-share/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((body) => {
        if (!body.ok) { setError(body.error || "공유 링크를 열 수 없습니다."); return; }
        setReport(body.report);
      })
      .catch(() => setError("공유 링크를 열 수 없습니다."))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <main style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 20px 80px" }}>
        <h1 style={{ fontSize: FS.lg, fontWeight: 900, color: C.ink, margin: "0 0 16px" }}>병원브랜드이미지 진단 — 공유된 리포트</h1>
        {loading && <p style={{ color: C.muted, fontSize: FS.sm }}>불러오는 중…</p>}
        {error && (
          <div style={{ background: "#FFF0F0", border: `1px solid ${C.danger}`, borderRadius: R.md, padding: 16, color: C.danger, fontSize: FS.sm }}>
            {error}
          </div>
        )}
        {report && (
          <ReportView report={report} diagnosisId={null} readOnly onRestart={() => {}} onBackToStep={() => {}} />
        )}
      </div>
    </main>
  );
}
