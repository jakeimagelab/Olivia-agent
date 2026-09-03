"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import GlobalHeader from "@/components/GlobalHeader";
import PcrmSubNav from "@/components/pcrm/PcrmSubNav";
import { PcrmHeaderActionsProvider, usePcrmHeaderActionsSlot, usePcrmHeaderTitleSlot } from "@/components/pcrm/PcrmHeaderActionsSlot";

const TITLE: Record<string, string> = {
  "/clients":          "고객관리",
  "/select-galleries": "셀렉 갤러리",
  "/review-studio":    "리뷰컨텐츠",
  "/per":              "PER 리워드",
};

const DESCRIPTION: Record<string, string> = {
  "/select-galleries": "고객에게 촬영본을 전달하고 셀렉을 받는 갤러리를 관리합니다.",
};

const MESH_BG = [
  "radial-gradient(ellipse 130% 55% at 10% 0%,   rgba(21,88,85,.12)   0%, transparent 52%)",
  "radial-gradient(ellipse 90%  60% at 90% 100%,  rgba(235,143,34,.08) 0%, transparent 50%)",
  "radial-gradient(ellipse 80%  80% at 55% 50%,   rgba(86,155,140,.05) 0%, transparent 55%)",
  "#f0f4f2",
].join(",");

export default function ClientHubLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = TITLE[pathname] ?? (pathname.startsWith("/select-galleries") ? "셀렉 갤러리" : "고객 허브");
  const description = DESCRIPTION[pathname] ?? (pathname.startsWith("/select-galleries") ? DESCRIPTION["/select-galleries"] : undefined);
  // PcrmSubNav 자체가 /per, /review-studio로 가는 메뉴를 담고 있으므로, 그 메뉴를 눌러 들어간 뒤에도
  // 같은 서브내비게이션이 계속 보여야 "연동된 한 화면"처럼 느껴진다 — /clients로만 한정하지 않는다.
  const isPcrmSection =
    pathname === "/clients" || pathname.startsWith("/clients/") ||
    pathname === "/per" || pathname.startsWith("/per/") ||
    pathname === "/review-studio" || pathname.startsWith("/review-studio/");
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    const isEmbed =
      (window.self !== window.top) ||
      document.documentElement.classList.contains("pc-embed") ||
      new URLSearchParams(window.location.search).get("embed") === "1";
    setInIframe(isEmbed);
  }, []);

  if (isPcrmSection) {
    return (
      <div style={{ minHeight: "100vh", background: MESH_BG, fontFamily: "var(--font-sans)", color: "#1C2B28" }}>
        <PcrmHeaderActionsProvider>
          {!inIframe && <PcrmSectionHeader />}
          {!inIframe && <Suspense fallback={null}><PcrmSubNav /></Suspense>}
          <div className="pc-page-content">
            {children}
          </div>
        </PcrmHeaderActionsProvider>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: MESH_BG, fontFamily: "var(--font-sans)", color: "#1C2B28" }}>
      {!inIframe && <GlobalHeader title={title} description={description} />}

      <div className="pc-page-content">
        {children}
      </div>
    </div>
  );
}

const PCRM_SECTION_META: Record<string, { title: string; description: string }> = {
  "/clients":       { title: "Clients",     description: "고객과 진행 중인 프로젝트를 관리합니다." },
  "/per":           { title: "PER 리워드",  description: "고객 추천 리워드 적립·신청·후속 관리를 처리합니다." },
  "/review-studio": { title: "리뷰컨텐츠",  description: "클라이언트 반응을 수집해 포토클리닉 홍보 인스타 콘텐츠로 만듭니다." },
};

function pcrmSectionFallback(pathname: string) {
  if (pathname.startsWith("/per")) return PCRM_SECTION_META["/per"];
  if (pathname.startsWith("/review-studio")) return PCRM_SECTION_META["/review-studio"];
  return PCRM_SECTION_META["/clients"];
}

// /clients 페이지가 검색창/등록 버튼을 PcrmHeaderActionsSlot으로 꽂아 넣으면 여기서 받아
// GlobalHeader 오른쪽에 그대로 얹는다. /per 하위 페이지들처럼 자기만의 제목(예: 병원 이름)이
// 필요한 경우 usePcrmHeaderTitle로 titleOverride를 꽂아 넣으면 그걸 우선 쓰고, 없으면 섹션
// 기본값(Clients/PER 리워드/리뷰컨텐츠)으로 떨어진다.
function PcrmSectionHeader() {
  const pathname = usePathname();
  const pageActions = usePcrmHeaderActionsSlot();
  const titleOverride = usePcrmHeaderTitleSlot();
  const meta = titleOverride ?? pcrmSectionFallback(pathname ?? "");
  return <GlobalHeader title={meta.title} description={meta.description} pageActions={pageActions} />;
}
