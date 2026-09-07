"use client";

import { Download } from "lucide-react";

// window.print()의 "PDF로 저장"을 그대로 활용한다 — 옛 시스템의 html2canvas+jsPDF 커스텀
// 페이지네이션만큼 정교하진 않지만, @media print 스타일(이 페이지의 style 태그)만으로
// 충분히 인쇄 가능한 결과를 낸다. 픽셀 단위로 맞춰야 하면 나중에 같은 라이브러리로 교체하면 된다.
export default function ShareViewPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px",
        borderRadius: 8, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.12)",
        color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
      }}
    >
      <Download size={13} /> PDF로 저장
    </button>
  );
}
