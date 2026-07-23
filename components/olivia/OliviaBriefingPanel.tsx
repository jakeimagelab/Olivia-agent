import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { OliviaAssistantTab } from "./OliviaAssistantWorkspace";

const SECTION_TABS: Record<string, OliviaAssistantTab> = {
  urgent: "긴급",
  approvals: "승인 대기",
  today: "오늘",
  customer_reactions: "고객 반응",
  suggestions: "제안",
};

export default function OliviaBriefingPanel({
  briefing,
  onSectionSelect,
  onRefresh,
  refreshing = false,
  message = "",
}: {
  briefing: any;
  onSectionSelect?: (tab: OliviaAssistantTab) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  message?: string;
}) {
  if (!briefing) {
    return (
      <div className="olivia-empty olivia-briefing-empty">
        <span>아직 생성된 브리핑이 없습니다.</span>
        {onRefresh ? (
          <button type="button" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={12} aria-hidden="true" className={refreshing ? "is-spinning" : undefined}/>
            {refreshing ? "생성 중" : "지금 브리핑 생성"}
          </button>
        ) : null}
        {message ? <small role="status">{message}</small> : null}
      </div>
    );
  }
  return (
    <section className="olivia-briefing-panel">
      <div className="olivia-briefing-heading">
        <div><span>OLIVIA BRIEFING</span><h2>{briefing.title}</h2></div>
        <div className="olivia-briefing-actions">
          <time>{briefing.briefing_date}</time>
          {onRefresh ? (
            <button type="button" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw size={12} aria-hidden="true" className={refreshing ? "is-spinning" : undefined}/>
              {refreshing ? "갱신 중" : "지금 갱신"}
            </button>
          ) : null}
        </div>
      </div>
      <p>{briefing.summary}</p>
      {message ? <p className="olivia-briefing-message" role="status">{message}</p> : null}
      <div className="olivia-briefing-sections">
        {(briefing.sections ?? []).map((section: any) => {
          const targetTab = SECTION_TABS[section.key];
          if (targetTab && onSectionSelect) {
            return (
              <button type="button" key={section.key} onClick={() => onSectionSelect(targetTab)}>
                <strong>{section.title}</strong><b>{section.items?.length ?? 0}</b>
              </button>
            );
          }
          if (section.key === "marketing") {
            return <Link key={section.key} href="/marketing"><strong>{section.title}</strong><b>{section.items?.length ?? 0}</b></Link>;
          }
          return <div key={section.key}><strong>{section.title}</strong><b>{section.items?.length ?? 0}</b></div>;
        })}
      </div>
    </section>
  );
}
