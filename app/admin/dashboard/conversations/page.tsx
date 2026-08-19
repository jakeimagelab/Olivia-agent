"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  created_at: string;
  role: "user" | "assistant";
  content: string;
  source?: string;
};

const PAGE_SIZE = 200;

function dateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function dateLabel(key: string): string {
  const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const yesterdayKey = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  if (key === todayKey) return "오늘";
  if (key === yesterdayKey) return "어제";
  const d = new Date(`${key}T00:00:00+09:00`);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekday})`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
}

function groupByDate(messages: ChatMessage[]) {
  const map = new Map<string, ChatMessage[]>();
  for (const m of messages) {
    const key = dateKey(m.created_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({ key, label: dateLabel(key), items }));
}

export default function ConversationsPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeKey, setActiveKey] = useState<string>();
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    fetch(`/api/olivia/messages?limit=${PAGE_SIZE}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok && Array.isArray(data.messages)) {
          setMessages(data.messages);
          setHasMore(data.messages.length >= PAGE_SIZE);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const loadMore = useCallback(async () => {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0]?.created_at;
      const res = await fetch(`/api/olivia/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldest)}`);
      const data = await res.json();
      if (data?.ok && Array.isArray(data.messages) && data.messages.length) {
        setMessages((prev) => [...data.messages, ...prev]);
        setHasMore(data.messages.length >= PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [messages, loadingMore]);

  const groups = groupByDate(messages);

  const scrollToDate = (key: string) => {
    setActiveKey(key);
    sectionRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="oa-page oa-conversations-page">
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#9BB5B0", fontSize: 13 }}>불러오는 중...</div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#9BB5B0", fontSize: 13 }}>아직 대화 기록이 없어요.</div>
      ) : (
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          {/* 왼쪽 날짜 레일 — 홈 채팅의 좌측 "대화 기록" 내비게이션과 같은 패턴(2026-08-16).
              날짜 클릭 시 오른쪽 본문에서 그 날짜 섹션으로 스크롤 이동한다. */}
          <aside style={{
            width: 132, flexShrink: 0, position: "sticky", top: 20,
            display: "flex", flexDirection: "column", gap: 3, maxHeight: "calc(100dvh - 100px)", overflowY: "auto",
          }}>
            {groups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => scrollToDate(group.key)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
                  border: "1px solid " + (activeKey === group.key ? "rgba(21,88,85,.3)" : "transparent"),
                  background: activeKey === group.key ? "#EAF4F2" : "transparent",
                  color: activeKey === group.key ? "#155855" : "#6F7E7A",
                  borderRadius: 10, padding: "7px 10px", font: "inherit", fontSize: 12, fontWeight: 800,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span>{group.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>{group.items.length}</span>
              </button>
            ))}
          </aside>

          <div style={{ flex: 1, minWidth: 0 }}>
            {groups.map((group) => (
              <section
                key={group.key}
                ref={(el) => { if (el) sectionRefs.current.set(group.key, el); else sectionRefs.current.delete(group.key); }}
                style={{ marginBottom: 28, scrollMarginTop: 20 }}
              >
                <h2 style={{
                  position: "sticky", top: 0, zIndex: 1, display: "inline-block",
                  fontSize: 11.5, fontWeight: 800, color: "#155855", background: "#EAF4F2",
                  borderRadius: 99, padding: "4px 12px", marginBottom: 12,
                }}>
                  {group.label}
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.items.map((m) => (
                    <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "78%", borderRadius: 16, padding: "10px 14px",
                        background: m.role === "user" ? "#155855" : "rgba(255,255,255,0.85)",
                        color: m.role === "user" ? "#fff" : "#1C2B28",
                        border: m.role === "user" ? "none" : "1px solid rgba(21,88,85,0.1)",
                        fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {m.content}
                        <div style={{ fontSize: 10, marginTop: 5, opacity: 0.6 }}>{timeLabel(m.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {hasMore && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{
                    border: "1px solid rgba(21,88,85,0.15)", background: "rgba(255,255,255,0.7)",
                    color: "#155855", fontSize: 12.5, fontWeight: 700, borderRadius: 99,
                    padding: "8px 18px", cursor: loadingMore ? "default" : "pointer",
                  }}
                >
                  {loadingMore ? "불러오는 중..." : "이전 대화 더보기"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
