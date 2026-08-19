"use client";

export type TabDef = {
  key: string;
  label: string;
  icon?: React.ReactNode;
};

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /* 탭 */
  tabs?: TabDef[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  actionsAfterTabs?: boolean;
}

export default function PageHeader({
  title,
  description,
  actions,
  tabs,
  activeTab,
  onTabChange,
  actionsAfterTabs = false,
}: PageHeaderProps) {
  const actionRow = actions ? <div className="pc-page-actions">{actions}</div> : null;
  const tabRow = tabs && tabs.length > 0 ? (
    <div className="pc-tabs pc-tabs--global">
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
  ) : null;

  return (
    <>
      <header className="pc-header pc-header--page-heading">
        <div className="pc-header-page-copy">
          <h1 className="pc-header-title">{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actionsAfterTabs ? null : actionRow}
      </header>

      {actionsAfterTabs ? tabRow : null}
      {actionsAfterTabs ? actionRow : tabRow}
    </>
  );
}
