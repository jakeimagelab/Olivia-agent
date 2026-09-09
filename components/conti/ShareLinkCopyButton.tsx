"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";

// 이 버튼이 뜨는 페이지 자체가 이미 공유 가능한 URL이라, 새 링크를 만들 필요 없이
// 현재 주소를 클립보드에 복사하는 것만 한다 — 백엔드/토큰 발급 없음.
export default function ShareLinkCopyButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 API를 못 쓰는 환경(권한 거부 등)이면 조용히 무시 — 주소창에서 직접 복사 가능.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px",
        borderRadius: 8, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.12)",
        color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0,
      }}
    >
      <Link2 size={13} /> {copied ? "복사됨!" : "링크 복사"}
    </button>
  );
}
