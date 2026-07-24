"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import type { MarketingBriefingItem as MarketingItem } from "@/lib/dashboardBriefing";

const CATEGORY_LABEL = {
  policy: "정책·법률",
  search_trend: "검색 트렌드",
  competitor: "경쟁 분석",
  content_insight: "콘텐츠 인사이트",
  market: "환자·시장",
} as const;

export default function MarketingBriefingItem({
  item,
  saved,
  onSave,
}: {
  item: MarketingItem;
  saved: boolean;
  onSave: (id: string) => void;
}) {
  return (
    <article className="home-marketing-item">
      <div className="home-marketing-item__top">
        <span>{CATEGORY_LABEL[item.category]}</span>
        {item.importance === "high" ? <strong>중요</strong> : null}
      </div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      {item.recommendation ? (
        <p className="home-marketing-item__recommend"><b>추천</b>{item.recommendation}</p>
      ) : null}
      <div className="home-marketing-item__meta">
        <span>{item.source ?? "올리비아 브리핑"}</span>
        {item.publishedAt ? <time>{item.publishedAt}</time> : null}
      </div>
      <div className="home-marketing-item__actions">
        {item.actionHref && item.actionLabel ? <Link href={item.actionHref}>{item.actionLabel}</Link> : <span/>}
        <button type="button" className={saved ? "is-saved" : undefined} onClick={() => onSave(item.id)} aria-pressed={saved}>
          <Bookmark size={13} fill={saved ? "currentColor" : "none"}/>{saved ? "저장됨" : "저장"}
        </button>
      </div>
    </article>
  );
}
