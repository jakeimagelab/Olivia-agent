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
  "radial-gradient(ellipse 130% 55% at 10% 0%, rgba(73,143,121,.16) 0%, transparent 52%)",
  "radial-gradient(ellipse 90% 60% at 90% 100%, rgba(128,188,157,.13) 0%, transparent 50%)",
  "radial-gradient(ellipse 80% 80% at 55% 50%, rgba(177,218,195,.16) 0%, transparent 55%)",
  "#edf7f1",
].join(",");

export default function ContiStudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 공유 링크로 들어온 외부 세션이면 자신에게 허용된 탭 하나만 보여준다.
  // (실제 접근 제한은 middleware에서 처리 — 여기서는 혼란을 줄이기 위한 화면 정리일 뿐)
  const [shareScope, setShareScope] = useState<string | null>(null);
  useEffect(() => { setShareScope(readCookie("pc_share_scope")); }, []);
  const visibleTabs = shareScope ? CONTI_TABS.filter((t) => t.matches.includes(shareScope)) : CONTI_TABS;

  return (
    <div style={{ minHeight: "100vh", background: MESH_BG, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      <PageHeader title="콘티생성" />

      <nav className="pc-tabs pc-tabs--global" aria-label="콘티 기능">
        {visibleTabs.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className={`pc-tab${t.matches.includes(pathname) ? " pc-tab--active" : ""}`}
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
