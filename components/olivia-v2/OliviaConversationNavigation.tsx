"use client";

import { memo } from "react";
import { CalendarDays, ChevronRight, Clock3, X } from "lucide-react";
import { getTodayDateKey, groupExchangesByDate, type OliviaExchange } from "@/lib/olivia/conversationTimeline";

type NavigationProps = {
  exchanges: OliviaExchange[];
  activeId?: string;
  onNavigate: (messageId: string) => void;
};

// 홈 채팅은 아이디어 회의가 아니라 "오늘 무슨 업무를 지시·실행했는지" 확인하는 용도라서
// 좌측 대화 기록은 오늘 하루만 보여준다(2026-08-16) — 그 이전 기록은 사이드바 "대화" 메뉴
// (/admin/dashboard/conversations)에서 날짜별로 전체를 본다. DB/서버는 그대로, 화면 표시만 제한.
export const OliviaConversationNavigator = memo(function OliviaConversationNavigator({ exchanges, activeId, onNavigate }: NavigationProps) {
  const todayKey = getTodayDateKey();
  const todayExchanges = exchanges.filter((exchange) => exchange.dateKey === todayKey);
  const groups = groupExchangesByDate(todayExchanges);
  return (
    <nav className="olivia-history-nav" aria-label="오늘 대화 기록">
      <div className="olivia-history-nav__title"><CalendarDays size={13} /><strong>오늘 대화 기록</strong></div>
      <div className="olivia-history-nav__groups">
        {groups.length ? groups.map((group) => (
          <section key={group.dateKey}>
            <h3>{group.dateLabel}</h3>
            {group.topicGroups.map((topicGroup, topicIndex) => (
              <div key={`${group.dateKey}:${topicGroup.topicKey}:${topicIndex}`}>
                {group.topicGroups.length > 1 ? <h4 data-topic={topicGroup.topicKey}>{topicGroup.topicLabel}</h4> : null}
                {topicGroup.exchanges.map((exchange) => (
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
              </div>
            ))}
          </section>
        )) : exchanges.length ? <p>오늘은 아직 대화가 없어요. 이전 기록은 사이드바 "대화" 메뉴에서 볼 수 있어요.</p> : <p>대화를 시작하면 여기에 기록돼요.</p>}
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
            data-topic={exchange.topicKey}
            className={activeId === exchange.userMessageId ? "is-active" : ""}
            aria-label={`${exchange.timeLabel} ${exchange.topicLabel} · ${exchange.userText}`}
            aria-pressed={selectedId === exchange.userMessageId}
            onClick={() => onSelect(selectedId === exchange.userMessageId ? undefined : exchange.userMessageId)}
          />
        ))}
      </div>
      {selected ? (
        <div className="olivia-message-guide__popover" role="dialog" aria-label="대화 내용 미리보기">
          <button className="olivia-message-guide__close" type="button" onClick={() => onSelect(undefined)} aria-label="닫기"><X size={13} /></button>
          <time><Clock3 size={11} /> {selected.dateLabel} {selected.timeLabel}</time>
          <span className="olivia-message-guide__topic" data-topic={selected.topicKey}>{selected.topicLabel}</span>
          <strong>{selected.userText}</strong>
          <p>{selected.assistantText}</p>
          <button className="olivia-message-guide__jump" type="button" onClick={() => { onNavigate(selected.userMessageId); onSelect(undefined); }}>이 대화로 이동</button>
        </div>
      ) : null}
    </aside>
  );
});
