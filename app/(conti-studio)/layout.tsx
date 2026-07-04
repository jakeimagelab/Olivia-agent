"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const CONTI_TABS = [
  { href: "/conti",       label: "📋 사진콘티", matches: ["/conti"] },
  { href: "/video-conti", label: "🎬 영상콘티", matches: ["/video-conti"] },
];

const MESH_BG = [
  "radial-gradient(ellipse 130% 55% at 10% 0%,   rgba(21,88,85,.12)   0%, transparent 52%)",
  "radial-gradient(ellipse 90%  60% at 90% 100%,  rgba(235,143,34,.08) 0%, transparent 50%)",
  "radial-gradient(ellipse 80%  80% at 55% 50%,   rgba(86,155,140,.05) 0%, transparent 55%)",
  "#f0f4f2",
].join(",");

export default function ContiStudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 공유 링크로 들어온 외부 세션이면 자신에게 허용된 탭 하나만 보여준다.
  // (실제 접근 제한은 middleware에서 처리 — 여기서는 혼란을 줄이기 위한 화면 정리일 뿐)
  const [shareScope, setShareScope] = useState<string | null>(null);
  useEffect(() => { setShareScope(readCookie("pc_share_scope")); }, []);
  const visibleTabs = shareScope ? CONTI_TABS.filter((t) => t.matches.includes(shareScope)) : CONTI_TABS;

  return (
    <div style={{ minHeight: "100vh", background: MESH_BG, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <PageHeader title={title} />

      <nav style={{
        background: "rgba(255,255,255,.72)",
        backdropFilter: "blur(16px) saturate(1.6)",
        WebkitBackdropFilter: "blur(16px) saturate(1.6)",
        borderBottom: "1px solid rgba(255,255,255,.7)",
        boxShadow: "0 1px 0 rgba(21,88,85,.07)",
        display: "flex", overflowX: "auto", position: "sticky", top: 56, zIndex: 90,
      }}>
        {visibleTabs.map(t => (
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
