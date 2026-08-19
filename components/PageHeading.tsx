"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { C, FS, SP } from "@/lib/theme";

// 기존 components/PageHeader.tsx는 로고+탭이 있는 상단 고정 네비게이션 바(pc-header)라
// 용도가 달라서 그대로 두고, 이 컴포넌트는 그 아래에 들어가는 "페이지 소개" 블록
// (kicker + 큰 타이틀 + 설명 + 액션)을 새로 만들었다.
type PageHeadingProps = {
  title: string;
  desc?: string;
  kicker?: string;
  backHref?: string;   // 없으면 뒤로가기 버튼 미표시
  actions?: ReactNode;  // 우측 버튼 슬롯
};

export function PageHeading({ title, desc, kicker, backHref, actions }: PageHeadingProps) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      gap: SP.lg, padding: `${SP.lg}px ${SP.xl}px`,
      background: C.white, borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: SP.md, minWidth: 0 }}>
        {backHref && (
          <Link href={backHref} aria-label="뒤로가기" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, flexShrink: 0, marginTop: 2,
            borderRadius: "50%", border: `1px solid ${C.border}`,
            background: C.mint, color: C.teal, textDecoration: "none",
          }}>
            <ArrowLeft size={17} aria-hidden="true" />
          </Link>
        )}
        <div style={{ minWidth: 0 }}>
          {kicker && (
            <div style={{
              fontSize: FS.xs, fontWeight: 900, color: C.orange,
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4,
            }}>{kicker}</div>
          )}
          <h1 style={{ margin: 0, fontSize: FS.xxl, fontWeight: 900, color: C.ink, letterSpacing: "-0.3px" }}>
            {title}
          </h1>
          {desc && (
            <p style={{ margin: "6px 0 0", fontSize: FS.sm, color: C.muted, lineHeight: 1.5 }}>
              {desc}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.sm, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}

export default PageHeading;
