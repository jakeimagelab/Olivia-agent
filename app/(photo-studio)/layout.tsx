"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import PageHeader from "@/components/PageHeader";

const PHOTO_TABS = [
  { href: "/photo-sorting",    label: "📁 사진 분류",  matches: ["/photo-sorting", "/raw-select"] },
  { href: "/photo-retouching", label: "🎨 색감·보정",  matches: ["/photo-retouching"] },
];

const TITLE: Record<string, string> = {
  "/photo-sorting":    "사진 분류",
  "/photo-retouching": "사진 보정",
  "/raw-select":       "AI 컷 정리 & RAW 셀렉",
};

export default function PhotoStudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = TITLE[pathname] ?? "사진 작업실";

  return (
    <div style={{ minHeight: "100vh", background: "#EDF5F3", fontFamily: "'Noto Sans KR', sans-serif" }}>
      <PageHeader title={title} />

      <nav style={{ background: "#FFFFFF", borderBottom: "1px solid rgba(21,88,85,.12)", display: "flex", overflowX: "auto" }}>
        {PHOTO_TABS.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className={`pc-photo-tab${t.matches.includes(pathname) ? " active" : ""}`}
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
