"use client";
import Link from "next/link";

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
  return (
    <>
      <header className="pc-header">
        <div className="pc-header-left">
          <Link href={backHref} className="pc-header-back">
            ← <span>{backLabel}</span>
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
