"use client";

import Link from "next/link";

// channel-analysis-one.vercel.app 의 내부 헤더 높이(px)
// cross-origin이라 CSS 주입 불가 → overflow:hidden + 음수 margin으로 클리핑
const INNER_HEADER_H = 56;

export default function ChannelAnalyzerPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#EDF5F3" }}>

      {/* 우리 앱 헤더 */}
      <header className="pc-header" style={{ flexShrink: 0 }}>
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img
              src="/assets/photoclinic-logo.png"
              alt="포토클리닉"
              className="pc-header-logo"
            />
            <span className="pc-header-title">병원 채널 분석</span>
          </div>
        </div>
      </header>

      {/* iframe 클리핑 컨테이너 — 내부 헤더 영역을 잘라냄 */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <iframe
          src="https://channel-analysis-one.vercel.app/"
          style={{
            display: "block",
            width: "100%",
            // 내부 헤더만큼 위로 밀어올린 뒤 높이를 보상
            height: `calc(100% + ${INNER_HEADER_H}px)`,
            marginTop: -INNER_HEADER_H,
            border: 0,
          }}
          title="병원 채널 분석"
          allow="clipboard-write; clipboard-read"
        />
      </div>
    </div>
  );
}
