"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import GlobalHeader from "@/components/GlobalHeader";

type PageMeta = { title: string; description?: string };

const pageTitle: Record<string, PageMeta> = {
  "/admin/dashboard": { title: "홈" },
  "/admin/dashboard/home": { title: "홈" },
  "/admin/dashboard/conversations": { title: "History", description: "Olivia와 나눈 대화를 날짜별로 확인합니다." },
  "/admin/dashboard/memo": { title: "메모" },
  "/admin/dashboard/calendar": { title: "캘린더" },
  "/admin/dashboard/mailing": { title: "메일링" },
  "/admin/dashboard/links": { title: "외부링크" },
  "/admin/dashboard/trash": { title: "휴지통" },
  "/admin/tools": { title: "All Tools", description: "견적서, 계약서, 콘티, 사진 작업 등 실제 업무 도구를 실행합니다." },
  "/admin/tools/quote": { title: "견적서 생성기" },
  "/admin/tools/contract": { title: "계약서 생성기" },
  "/admin/tools/conti": { title: "콘티 생성기" },
  "/admin/tools/photo-sorting": { title: "사진 분류기" },
  "/admin/tools/select-galleries": { title: "셀렉 갤러리" },
  "/admin/tools/raw-matching": { title: "RAW 자동 매칭" },
  "/admin/tools/retouching": { title: "보정 관리" },
  "/admin/tools/seo-delivery": { title: "AI 검색 최적화 납품" },
  "/admin/tools/reviews": { title: "후기 DB" },
  "/admin/tools/rewards": { title: "리워드 관리" },
  "/admin/tools/content": { title: "콘텐츠 제작" },
};

type AdminHeaderProps = {
  onMenuToggle?: () => void;
};

function getPageMeta(pathname: string): PageMeta {
  if (pageTitle[pathname]) return pageTitle[pathname];
  const parentPath = Object.keys(pageTitle)
    .filter((path) => pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  return pageTitle[parentPath] ?? pageTitle["/admin/dashboard"];
}

export function AdminHeader({ onMenuToggle }: AdminHeaderProps) {
  const pathname = usePathname();
  const dashboardHome = pathname === "/admin/dashboard" || pathname === "/admin/dashboard/home";

  // /admin/dashboard(/home)는 Agent-first Home(OliviaAdaptiveStage)이 화면 전체를 쓰는 전용
  // 레이아웃이라 전통적인 헤더를 얹지 않는다 — 버그가 아니라 의도된 설계.
  if (dashboardHome) {
    return (
      <button className="oa-header__menu-dock" type="button" onClick={onMenuToggle} aria-label="관리자 메뉴 열기">
        <Menu size={20} aria-hidden="true" /> 메뉴
      </button>
    );
  }

  return (
    <>
      <GlobalHeader title={getPageTitle(pathname)} />
      <button className="oa-header__menu-dock" type="button" onClick={onMenuToggle} aria-label="관리자 메뉴 열기">
        <Menu size={20} aria-hidden="true" /> 메뉴
      </button>
    </>
  );
}

export default AdminHeader;
