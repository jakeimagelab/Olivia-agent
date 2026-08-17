"use client";

import { useEffect, useState } from "react";
import { FileText, FileSignature, Clapperboard } from "lucide-react";

type RecentWorkItem = { id: string; kind: "콘티" | "견적" | "계약"; title: string; timestamp: string };

const KIND_ICON = { "콘티": Clapperboard, "견적": FileText, "계약": FileSignature } as const;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "어제" : `${days}일 전`;
}

export default function RecentWork() {
  const [items, setItems] = useState<RecentWorkItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/recent-work", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (!cancelled && Array.isArray(data?.items)) setItems(data.items); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="pc-panel">
      <div className="pc-panel__header">
        <h3>최근 작업</h3>
      </div>
      <div className="pc-recent-work__list">
        {items === null ? (
          <div className="pc-panel__empty">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="pc-panel__empty">최근 작업이 없어요.</div>
        ) : (
          items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <div key={item.id} className="pc-recent-work__row">
                <span className={`pc-recent-work__icon pc-recent-work__icon--${item.kind}`}><Icon size={14} aria-hidden="true" /></span>
                <div className="pc-recent-work__main">
                  <strong>{item.title}</strong>
                  <small>{item.kind} · {relativeTime(item.timestamp)}</small>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
