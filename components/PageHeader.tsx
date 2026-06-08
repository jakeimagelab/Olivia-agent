"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  title: string;           // 페이지 타이틀 (영문 서브타이틀)
  backHref?: string;       // 뒤로가기 링크 (기본: "/")
  backLabel?: string;      // 뒤로가기 레이블 (기본: "관리자 홈")
  actions?: React.ReactNode; // 우측 버튼 영역
}

export default function PageHeader({
  title,
  backHref = "/",
  backLabel = "관리자 홈",
  actions,
}: PageHeaderProps) {
  return (
    <header className="pc-header">
      <div className="pc-header-left">
        <Link href={backHref} className="pc-header-back">
          <ArrowLeft size={15} />
          <span>{backLabel}</span>
        </Link>
        <div className="pc-header-divider" aria-hidden="true" />
        <div className="pc-header-brand">
          <img
            src="https://photoclinic-diangnoisis.vercel.app/logo.svg"
            alt="포토클리닉"
            className="pc-header-logo"
          />
          <span className="pc-header-title">{title}</span>
        </div>
      </div>
      {actions && <div className="pc-header-actions">{actions}</div>}
    </header>
  );
}
