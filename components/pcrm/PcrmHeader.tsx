"use client";

import { Suspense } from "react";
import AdminHeaderActions from "@/components/admin/AdminHeaderActions";
import AdminHeaderSearch from "@/components/admin/AdminHeaderSearch";

export default function PcrmHeader() {
  return (
    <header className="oa-header oa-header--enhanced">
      <div className="oa-header__brand">
        <img src="/assets/photoclinic-logo.png" alt="포토클리닉" />
        <h1 className="oa-header__title oa-header__title--compact">관리자 PCRM</h1>
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
