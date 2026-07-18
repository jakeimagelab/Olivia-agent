"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import AdminHeaderActions from "./AdminHeaderActions";
import AdminHeaderSearch from "./AdminHeaderSearch";

type PageMeta = { title: string; description: string };

const pageMeta: Record<string, PageMeta> = {
  "/admin/dashboard": { title: "포토클리닉 AI 비서", description: "포토클리닉 촬영 운영과 고객 관리를 한눈에 확인하세요." },
  "/admin/dashboard/home": { title: "포토클리닉 AI 비서", description: "포토클리닉 촬영 운영과 고객 관리를 한눈에 확인하세요." },
  "/admin/dashboard/memo": { title: "메모", description: "일반 텍스트, 펜 템플릿, AI 음성 요약으로 기록을 정리합니다." },
  "/admin/dashboard/calendar": { title: "캘린더", description: "촬영과 운영 일정을 한눈에 관리합니다." },
  "/admin/dashboard/mailing": { title: "메일링", description: "발송 대기 메일과 발송 이력을 관리합니다." },
  "/admin/dashboard/links": { title: "외부링크", description: "업무에 필요한 외부 서비스 링크를 관리합니다." },
  "/admin/dashboard/trash": { title: "휴지통", description: "삭제된 항목을 확인하고 복원합니다." },
  "/admin/tools": { title: "AI Assistant", description: "견적서, 계약서, 콘티, 사진 작업 등 실제 업무 도구를 실행합니다." },
  "/admin/tools/quote": { title: "견적서 생성기", description: "촬영 견적서를 빠르게 작성합니다." },
  "/admin/tools/contract": { title: "계약서 생성기", description: "프로젝트 계약서를 작성하고 관리합니다." },
  "/admin/tools/conti": { title: "콘티 생성기", description: "촬영 콘티와 장면 구성을 제작합니다." },
  "/admin/tools/photo-sorting": { title: "사진 분류기", description: "RAW와 JPG 파일을 기준에 맞게 분류합니다." },
  "/admin/tools/select-galleries": { title: "셀렉 갤러리", description: "고객 사진 셀렉 갤러리를 만들고 관리합니다." },
  "/admin/tools/raw-matching": { title: "RAW 자동 매칭", description: "고객 셀렉 결과와 RAW 원본을 자동 매칭합니다." },
  "/admin/tools/retouching": { title: "보정 관리", description: "사진 보정 진행 상태와 전달 일정을 관리합니다." },
  "/admin/tools/seo-delivery": { title: "AI 검색 최적화 납품", description: "검색에 최적화된 납품 자료를 준비합니다." },
  "/admin/tools/reviews": { title: "후기 DB", description: "고객 후기와 활용 상태를 관리합니다." },
  "/admin/tools/rewards": { title: "리워드 관리", description: "고객 리워드 지급과 사용 현황을 관리합니다." },
  "/admin/tools/content": { title: "콘텐츠 제작", description: "촬영 결과를 활용한 콘텐츠 제작을 시작합니다." },
};

type AdminHeaderProps = {
  onMenuToggle?: () => void;
};

function getPageMeta(pathname: string): PageMeta {
  if (pageMeta[pathname]) return pageMeta[pathname];
  const parentPath = Object.keys(pageMeta)
    .filter((path) => pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  return pageMeta[parentPath] ?? pageMeta["/admin/dashboard"];
}

export function AdminHeader({ onMenuToggle }: AdminHeaderProps) {
  const pathname = usePathname();
  const meta = getPageMeta(pathname);
  const compactTitle = pathname === "/admin/dashboard" || pathname === "/admin/dashboard/home" || pathname === "/admin/tools";
  const dashboardHome = pathname === "/admin/dashboard" || pathname === "/admin/dashboard/home";
  const toolsHome = pathname === "/admin/tools";
  const enhanced = dashboardHome || toolsHome;

  return (
    <>
      <header className={`oa-header${enhanced ? " oa-header--enhanced" : ""}`}>
        <div className="oa-header__brand">
          <img src="/assets/photoclinic-logo.png" alt="포토클리닉" />
          <h1 className={`oa-header__title${compactTitle ? " oa-header__title--compact" : ""}`}>{meta.title}</h1>
        </div>
        {enhanced ? <div className="oa-header__command-area">
          <Suspense fallback={<div className="oa-header-search oa-header-search--loading" aria-label="검색 준비 중"/>}>
            <AdminHeaderSearch mode={toolsHome ? "tools" : "global"}/>
          </Suspense>
          {dashboardHome ? <AdminHeaderActions/> : null}
        </div> : null}
      </header>
      <button className="oa-header__menu-dock" type="button" onClick={onMenuToggle} aria-label="관리자 메뉴 열기">
        <Menu size={20} aria-hidden="true" /> 메뉴
      </button>
    </>
  );
}

export default AdminHeader;
