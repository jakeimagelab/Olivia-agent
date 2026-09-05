"use client";

import type { CSSProperties, ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  /* 제안서 1.5 — 사진/영상 색 판단 화면 이외에는 콘텐츠 #FDFCFA / 패널 #F7F5F1를 쓴다.
     기본값은 패널(카드는 대체로 콘텐츠 위에 얹히는 패널 역할). */
  tone?: "content" | "panel" | "white";
  padding?: number | string;
  style?: CSSProperties;
};

const toneBg: Record<NonNullable<CardProps["tone"]>, string> = {
  content: "var(--content-bg)",
  panel: "var(--panel-bg)",
  white: "#fff",
};

// OLIVIA OS Desktop UI 제안서 3단계 — 유형 A~H 전반에서 반복되는 "얇은 테두리 + 둥근 모서리"
// 카드 껍데기를 하나로 통일한다. 내부 레이아웃(리스트/그리드/폼)은 각 화면이 결정한다.
export default function Card({ children, tone = "panel", padding = 20, style }: CardProps) {
  return (
    <div
      style={{
        background: toneBg[tone],
        border: ".5px solid var(--line)",
        borderRadius: 12,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
