"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import GlobalHeader from "@/components/GlobalHeader";
import PcrmSubNav from "@/components/pcrm/PcrmSubNav";
import { PcrmHeaderActionsProvider, usePcrmHeaderActionsSlot } from "@/components/pcrm/PcrmHeaderActionsSlot";

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
      {!inIframe && <PageHeader title={title} />}

      <div className="pc-page-content">
        {children}
      </div>
    </div>
  );
}

// /clients 페이지가 검색창/등록 버튼을 PcrmHeaderActionsSlot으로 꽂아 넣으면 여기서 받아
// GlobalHeader 오른쪽에 그대로 얹는다 — /per, /review-studio처럼 꽂아 넣는 페이지가 없으면
// 그냥 빈 슬롯이라 기본 헤더와 동일하게 보인다.
function PcrmSectionHeader() {
  const pageActions = usePcrmHeaderActionsSlot();
  return <GlobalHeader title="Clients" description="고객과 진행 중인 프로젝트를 관리합니다." pageActions={pageActions} />;
}
