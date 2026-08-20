"use client";

import { Suspense, type ReactNode } from "react";
import AdminHeaderSearch from "@/components/admin/AdminHeaderSearch";
import AdminHeaderActions from "@/components/admin/AdminHeaderActions";

type GlobalHeaderProps = {
  title: string;
  description?: string;
  className?: string;
  /* 페이지 고유 컨트롤(예: 일정의 일/주/월/년 전환, 고객관리의 검색+등록 버튼)을
     검색/알림/빠른실행 앞에 끼워 넣는 슬롯 — 없으면 공용 컨트롤만 보인다. */
  pageActions?: ReactNode;
};

// 홈/일정/고객관리/기록/전체보기 5개 주요 페이지가 공유하는 단일 헤더.
// 기존 AdminHeader가 이미 쓰던 oa-header/oa-header--enhanced/oa-header--page 클래스를 그대로
// 재사용해서 높이·패딩 등 레이아웃 수치는 새로 만들지 않는다 — 페이지마다 title만 바뀐다.
export default function GlobalHeader({ title, description, className = "", pageActions }: GlobalHeaderProps) {
  return (
    <header className={`oa-header oa-header--enhanced oa-header--page${className ? ` ${className}` : ""}`}>
      <div className="oa-header__page-copy">
        <h1 className="oa-header__title">{title}</h1>
        {description ? <p className="oa-header__description">{description}</p> : null}
      </div>
      <div className="oa-header__command-area">
        {pageActions ? <div className="oa-header__page-actions">{pageActions}</div> : null}
        <Suspense fallback={<div className="oa-header-search oa-header-search--loading" aria-label="검색 준비 중" />}>
          <AdminHeaderSearch mode="global" />
        </Suspense>
        <AdminHeaderActions />
      </div>
    </header>
  );
}
