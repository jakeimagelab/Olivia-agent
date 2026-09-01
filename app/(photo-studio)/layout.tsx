"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import GlobalHeader from "@/components/GlobalHeader";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const PHOTO_TABS = [
  { href: "/photo-sorting?mode=classification", label: "📁 사진 분류", matches: ["/photo-sorting"] },
  { href: "/video-sorting",    label: "🎥 영상 분류",         matches: ["/video-sorting"] },
  { href: "/video-convert",    label: "🔄 4K→FHD 변환",       matches: ["/video-convert"] },
  { href: "/raw-select",       label: "✂️ AI 컷 정리 & RAW",  matches: ["/raw-select"] },
  { href: "/select-match",     label: "🎯 셀렉 & 매칭",       matches: ["/select-match"] },
  { href: "/photo-retouching", label: "🎨 색감·보정",         matches: ["/photo-retouching"] },
];

const TITLE: Record<string, { title: string; description: string }> = {
  "/photo-sorting":    { title: "사진 분류",         description: "사진 분류·색감 체크·피부톤 DNA 비교·Photoshop 보정 가이드를 한 화면에서 관리합니다." },
  "/video-sorting":    { title: "영상 분류",         description: "영상 파일을 AI가 카테고리별로 자동 분류하거나 촬영 시간 간격으로 Scene 폴더로 나누어 정리합니다." },
  "/video-convert":    { title: "4K→FHD 변환",       description: "4K·고해상도 영상을 브라우저 내에서 FHD(1920×1080)로 변환하고 결과를 폴더에 저장합니다." },
  "/photo-retouching": { title: "사진 보정",         description: "사진을 업로드해 AI로 피부톤 또는 가운 색을 기준과 비교하고 Photoshop·Camera Raw 보정값을 제공합니다." },
  "/raw-select":       { title: "AI 컷 정리 & RAW 셀렉", description: "촬영 JPG를 품질·중복도로 필터링하고 선택된 사진과 매칭하는 RAW 파일을 자동으로 결과 폴더에 정리합니다." },
  "/select-match":     { title: "셀렉 & 매칭",       description: "고객이 선택한 사진 파일명을 RAW 원본과 자동으로 매칭해 Selected_RAW 폴더에 정리합니다." },
};

const MESH_BG = [
  "radial-gradient(ellipse 130% 55% at 10% 0%,   rgba(21,88,85,.12)   0%, transparent 52%)",
  "radial-gradient(ellipse 90%  60% at 90% 100%,  rgba(235,143,34,.08) 0%, transparent 50%)",
  "radial-gradient(ellipse 80%  80% at 55% 50%,   rgba(86,155,140,.05) 0%, transparent 55%)",
  "#f0f4f2",
].join(",");

export default function PhotoStudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const unifiedWorkspace = pathname === "/photo-sorting";
  const meta = TITLE[pathname] ?? { title: "사진 작업실", description: "사진 분류·색감 체크·피부톤 DNA 비교·Photoshop 보정 가이드를 한 화면에서 관리합니다." };

  // 공유 링크로 들어온 외부 세션이면 자신에게 허용된 탭 하나만 보여준다.
  // (실제 접근 제한은 middleware에서 처리 — 여기서는 혼란을 줄이기 위한 화면 정리일 뿐)
  const [shareScope, setShareScope] = useState<string | null>(null);
  useEffect(() => { setShareScope(readCookie("pc_share_scope")); }, []);
  const visibleTabs = shareScope ? PHOTO_TABS.filter((t) => t.matches.includes(shareScope)) : PHOTO_TABS;

  return (
    <div style={{ minHeight: "100vh", background: MESH_BG, fontFamily: "var(--font-sans)" }}>
      {!unifiedWorkspace ? <GlobalHeader title={meta.title} description={meta.description} /> : null}

      {!unifiedWorkspace ? <nav className="pc-tabs pc-tabs--global" aria-label="사진 작업 기능">
        {visibleTabs.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className={`pc-tab${t.matches.includes(pathname) ? " pc-tab--active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </nav> : null}

      <div className={unifiedWorkspace ? undefined : "pc-page-content"}>
        {children}
      </div>
    </div>
  );
}
