"use client";

import { Suspense } from "react";
import AdminHeaderSearch from "@/components/admin/AdminHeaderSearch";
import AdminHeaderActions from "@/components/admin/AdminHeaderActions";
import OliviaCore from "@/components/olivia/OliviaCore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";

type AppHeaderSearchMode = "global" | "tools" | "none";

type AppHeaderProps = {
  title: string;
  description?: string;
  compact?: boolean;
  brandImage?: string;
  searchMode?: AppHeaderSearchMode;
  actionsHome?: boolean;
  showActions?: boolean;
  className?: string;
};

// UIUX 제안서 2차(에이전트 프레즌스, 7번 "헤더가 4~5개로 갈라져 있다") — AdminHeader/PcrmHeader가
// 거의 같은 oa-header 마크업을 각자 따로 구현하고 있던 걸 하나로 합친 공용 헤더. 클래스 이름은
// admin.css에 이미 있는 것만 재사용해서(oa-header/oa-header__*) 새 CSS 없이 기존 스타일을
// 그대로 탄다. 오른쪽 끝에 올리비아 상태 마크(OliviaCore)를 상시 배치해서, 페이지가 어디든
// "지금 올리비아가 무슨 상태인지"가 같은 자리에서 보이게 한다.
export default function AppHeader({
  title,
  description,
  compact = false,
  brandImage,
  searchMode = "none",
  actionsHome = false,
  showActions = true,
  className = "",
}: AppHeaderProps) {
  const isStreaming = useOliviaConversationStore((state) => state.isStreaming);

  return (
    <header className={`oa-header oa-header--enhanced${className ? ` ${className}` : ""}`}>
      {brandImage ? (
        <div className="oa-header__brand">
          <img src={brandImage} alt="포토클리닉" />
          <h1 className={`oa-header__title${compact ? " oa-header__title--compact" : ""}`}>{title}</h1>
        </div>
      ) : (
        <div className="oa-header__page-copy">
          <h1 className="oa-header__title">{title}</h1>
          {description ? <p className="oa-header__description">{description}</p> : null}
        </div>
      )}
      <div className="oa-header__command-area">
        {searchMode !== "none" ? (
          <Suspense fallback={<div className="oa-header-search oa-header-search--loading" aria-label="검색 준비 중" />}>
            <AdminHeaderSearch mode={searchMode} />
          </Suspense>
        ) : null}
        {showActions ? <AdminHeaderActions home={actionsHome} /> : null}
        <OliviaCore isStreaming={isStreaming} size={20} />
      </div>
    </header>
  );
}
