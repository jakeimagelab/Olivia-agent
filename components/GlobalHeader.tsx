"use client";

import { Suspense } from "react";
import AdminHeaderSearch from "@/components/admin/AdminHeaderSearch";
import AdminHeaderActions from "@/components/admin/AdminHeaderActions";

type GlobalHeaderProps = {
  title: string;
  className?: string;
};

// 홈/일정/고객관리/기록/전체보기 5개 주요 페이지가 공유하는 단일 헤더.
// 기존 AdminHeader가 이미 쓰던 oa-header/oa-header--enhanced/oa-header--page 클래스를 그대로
// 재사용해서 높이·패딩 등 레이아웃 수치는 새로 만들지 않는다 — 페이지마다 title만 바뀐다.
export default function GlobalHeader({ title, className = "" }: GlobalHeaderProps) {
  return (
    <header className={`oa-header oa-header--enhanced oa-header--page${className ? ` ${className}` : ""}`}>
      <div className="oa-header__page-copy">
        <h1 className="oa-header__title">{title}</h1>
      </div>
      <div className="oa-header__command-area">
        <Suspense fallback={<div className="oa-header-search oa-header-search--loading" aria-label="검색 준비 중" />}>
          <AdminHeaderSearch mode="global" />
        </Suspense>
        <AdminHeaderActions />
      </div>
    </header>
  );
}
