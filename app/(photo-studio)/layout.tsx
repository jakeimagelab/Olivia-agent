"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PHOTO_TABS = [
  { href: "/photo-sorting",    label: "📁 사진 분류" },
  { href: "/photo-retouching", label: "🎨 색감·보정" },
  { href: "/raw-select",       label: "🎯 AI 컷 정리 & RAW 셀렉" },
];

export default function PhotoStudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ minHeight: "100vh", background: "#EDF5F3", fontFamily: "'Noto Sans KR', sans-serif" }}>
      <nav style={{ background: "#FFFFFF", borderBottom: "1px solid rgba(21,88,85,.12)", display: "flex", alignItems: "stretch", overflowX: "auto" }}>
        <Link
          href="/"
          style={{
            padding: "0 16px", fontSize: 12, fontWeight: 700, color: "#9BB5B0",
            whiteSpace: "nowrap", textDecoration: "none", display: "inline-flex",
            alignItems: "center", gap: 4,
            borderRight: "1px solid rgba(21,88,85,.1)", flexShrink: 0,
          }}
        >
          ← 관리자 홈
        </Link>
        {PHOTO_TABS.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className={`pc-photo-tab${pathname === t.href ? " active" : ""}`}
            style={{ padding: "11px 22px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", textDecoration: "none", display: "inline-block" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="pc-page-content">
        {children}
      </div>
    </div>
  );
}
