"use client";

import { useEffect, useState } from "react";
import { Bot, CircleUserRound, MessageCircle, RefreshCw } from "lucide-react";

type ActivityItem = {
  id: string;
  kind: "olivia" | "admin" | "client" | "system";
  title: string;
  detail: string;
  createdAt: string;
};

function relativeTime(value: string) {
  const diffMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 1) return "방금";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}시간 전`;
  return `${Math.floor(diffMinutes / 1440)}일 전`;
}

export default function RecentActivityWidget() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/recent-activity", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (active && data?.ok) setItems(data.items ?? []); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="oa-recent-activity" aria-labelledby="recent-activity-title">
      <header className="oa-recent-activity__header">
        <div>
          <span>ACTIVITY</span>
          <h2 id="recent-activity-title">최근 활동</h2>
        </div>
        <RefreshCw size={15} aria-hidden="true" />
      </header>
      <div className="oa-recent-activity__list">
        {loading ? <p className="oa-recent-activity__empty">활동을 불러오고 있습니다.</p> : null}
        {!loading && items.length === 0 ? <p className="oa-recent-activity__empty">최근 활동이 없습니다.</p> : null}
        {items.slice(0, 6).map((item) => {
          const Icon = item.kind === "admin" ? CircleUserRound : item.kind === "client" ? MessageCircle : Bot;
          return (
            <article className={`oa-recent-activity__item is-${item.kind}`} key={item.id}>
              <span className="oa-recent-activity__icon"><Icon size={14} aria-hidden="true" /></span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
            </article>
          );
        })}
      </div>
    </section>
  );
}
