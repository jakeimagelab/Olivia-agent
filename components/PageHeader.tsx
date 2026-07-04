"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

function hasShareScope(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith("pc_share_scope="));
}

export type TabDef = {
  key: string;
  label: string;
  icon?: React.ReactNode;
};

interface PageHeaderProps {
  title: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  /* 탭 */
  tabs?: TabDef[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
}

export default function PageHeader({
  title,
  backHref = "/",
  backLabel = "관리자 홈",
  actions,
  tabs,
  activeTab,
  onTabChange,
}: PageHeaderProps) {
  // 외부 공유 링크로 들어온 세션이면 관리자 홈으로 돌아가는 길을 아예 보여주지 않는다.
  // 마운트 전엔 false — 서버 렌더와 클라이언트 첫 렌더를 동일하게 유지해 hydration mismatch를 피한다.
  const [isSharedSession, setIsSharedSession] = useState(false);
  useEffect(() => { setIsSharedSession(hasShareScope()); }, []);

  return (
    <>
      <header className="pc-header">
        <div className="pc-header-left">
          {!isSharedSession && (
            <>
              <Link href={backHref} className="pc-header-back">
                <ArrowLeft size={13} aria-hidden="true" />
                <span>{backLabel}</span>
              </Link>
              <div className="pc-header-divider" aria-hidden="true" />
            </>
          )}
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

      {tabs && tabs.length > 0 && (
        <div className="pc-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`pc-tab${activeTab === t.key ? " pc-tab--active" : ""}`}
              onClick={() => onTabChange?.(t.key)}
            >
              {t.icon && <span className="pc-tab-icon">{t.icon}</span>}
              {t.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
