"use client";

import { memo } from "react";
import { CalendarDays, ChevronRight, Clock3, X } from "lucide-react";
import { groupExchangesByDate, type OliviaExchange } from "@/lib/olivia/conversationTimeline";

type NavigationProps = {
  exchanges: OliviaExchange[];
  activeId?: string;
  onNavigate: (messageId: string) => void;
};

export const OliviaConversationNavigator = memo(function OliviaConversationNavigator({ exchanges, activeId, onNavigate }: NavigationProps) {
  const groups = groupExchangesByDate(exchanges);
  return (
    <nav className="olivia-history-nav" aria-label="날짜별 대화 기록">
      <div className="olivia-history-nav__title"><CalendarDays size={13} /><strong>대화 기록</strong></div>
      <div className="olivia-history-nav__groups">
        {groups.length ? groups.map((group) => (
          <section key={group.dateKey}>
            <h3>{group.dateLabel}</h3>
            {group.exchanges.map((exchange) => (
              <button
                key={exchange.id}
                type="button"
                className={activeId === exchange.userMessageId ? "is-active" : ""}
                onClick={() => onNavigate(exchange.userMessageId)}
              >
                <time>{exchange.timeLabel}</time>
                <span>{exchange.userText}</span>
                <ChevronRight size={11} />
              </button>
            ))}
          </section>
        )) : <p>대화를 시작하면 여기에 기록돼요.</p>}
      </div>
    </nav>
  );
});

type GuideProps = NavigationProps & {
  selectedId?: string;
  onSelect: (messageId?: string) => void;
};

export const OliviaConversationGuide = memo(function OliviaConversationGuide({ exchanges, activeId, selectedId, onNavigate, onSelect }: GuideProps) {
  const selected = exchanges.find((exchange) => exchange.userMessageId === selectedId);
  return (
    <aside className="olivia-message-guide" aria-label="긴 대화 위치 가이드">
      <div className="olivia-message-guide__ticks">
        {exchanges.map((exchange) => (
          <button
            key={exchange.id}
            type="button"
            className={activeId === exchange.userMessageId ? "is-active" : ""}
            aria-label={`${exchange.timeLabel} ${exchange.userText}`}
            aria-pressed={selectedId === exchange.userMessageId}
            onClick={() => onSelect(selectedId === exchange.userMessageId ? undefined : exchange.userMessageId)}
          />
        ))}
      </div>
      {selected ? (
        <div className="olivia-message-guide__popover" role="dialog" aria-label="대화 내용 미리보기">
          <button className="olivia-message-guide__close" type="button" onClick={() => onSelect(undefined)} aria-label="닫기"><X size={13} /></button>
          <time><Clock3 size={11} /> {selected.dateLabel} {selected.timeLabel}</time>
          <strong>{selected.userText}</strong>
          <p>{selected.assistantText}</p>
          <button className="olivia-message-guide__jump" type="button" onClick={() => { onNavigate(selected.userMessageId); onSelect(undefined); }}>이 대화로 이동</button>
        </div>
      ) : null}
    </aside>
  );
});
