"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import GlobalHeader from "@/components/GlobalHeader";

const pageTitle: Record<string, string> = {
  "/admin/dashboard": "홈",
  "/admin/dashboard/home": "홈",
  "/admin/dashboard/conversations": "기록",
  "/admin/dashboard/memo": "메모",
  "/admin/dashboard/calendar": "캘린더",
  "/admin/dashboard/mailing": "메일링",
  "/admin/dashboard/links": "외부링크",
  "/admin/dashboard/trash": "휴지통",
  "/admin/tools": "전체보기",
  "/admin/tools/quote": "견적서 생성기",
  "/admin/tools/contract": "계약서 생성기",
  "/admin/tools/conti": "콘티 생성기",
  "/admin/tools/photo-sorting": "사진 분류기",
  "/admin/tools/select-galleries": "셀렉 갤러리",
  "/admin/tools/raw-matching": "RAW 자동 매칭",
  "/admin/tools/retouching": "보정 관리",
  "/admin/tools/seo-delivery": "AI 검색 최적화 납품",
  "/admin/tools/reviews": "후기 DB",
  "/admin/tools/rewards": "리워드 관리",
  "/admin/tools/content": "콘텐츠 제작",
};

type AdminHeaderProps = {
  onMenuToggle?: () => void;
};

function getPageTitle(pathname: string): string {
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
