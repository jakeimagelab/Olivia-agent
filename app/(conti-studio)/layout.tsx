"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import GlobalHeader from "@/components/GlobalHeader";
import SegmentedTabs from "@/components/ui/SegmentedTabs";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const CONTI_TABS = [
  { href: "/conti",       label: "📋 사진콘티", matches: ["/conti"] },
  { href: "/video-conti", label: "🎬 영상콘티", matches: ["/video-conti"] },
];

const MESH_BG = "#edf7f1";

export default function ContiStudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 공유 링크로 들어온 외부 세션이면 자신에게 허용된 탭 하나만 보여준다.
  // (실제 접근 제한은 middleware에서 처리 — 여기서는 혼란을 줄이기 위한 화면 정리일 뿐)
  const [shareScope, setShareScope] = useState<string | null>(null);
  useEffect(() => { setShareScope(readCookie("pc_share_scope")); }, []);
  const visibleTabs = shareScope ? CONTI_TABS.filter((t) => t.matches.includes(shareScope)) : CONTI_TABS;

  return (
    <div style={{ minHeight: "100vh", background: MESH_BG, fontFamily: "var(--font-sans)" }}>
      <GlobalHeader title="콘티" description="진료과와 촬영 항목을 선택하면 실제 촬영 가능한 콘티를 자동으로 구성합니다." />

      <div style={{ padding: "20px 24px 0" }}>
        <SegmentedTabs
          ariaLabel="콘티 기능"
          value={pathname}
          onChange={() => {}}
          items={visibleTabs.map(t => ({ value: t.matches[0] ?? t.href, label: t.label, href: t.href }))}
        />
      </div>

      <div className="pc-page-content">
        {children}
      </div>
    </div>
  );
}
