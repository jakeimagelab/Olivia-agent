"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import MarketingBriefingItem from "@/components/dashboard/MarketingBriefingItem";
import type { MarketingBriefingCategory, MarketingBriefingItem as MarketingItem } from "@/lib/dashboardBriefing";
import { FALLBACK_MARKETING_BRIEFING } from "@/lib/mockMarketingBriefing";

type Filter = "all" | MarketingBriefingCategory;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "policy", label: "정책·법률" },
  { value: "search_trend", label: "검색" },
  { value: "competitor", label: "경쟁" },
  { value: "content_insight", label: "콘텐츠" },
];

function buildLiveItems(trend: any, ideas: any): MarketingItem[] {
  const items: MarketingItem[] = [];
  const rising = trend?.risingKeywords?.[0];
  if (rising?.keyword) {
    items.push({
      id: `trend:${rising.keyword}`,
      category: "search_trend",
      title: `${rising.keyword} 검색 관심 상승`,
      summary: `최근 수집 데이터에서 검색 관심이 ${Math.round(Number(rising.growthPct || 0))}% 변했습니다.`,
      source: "병원 트렌드 분석",
      importance: Number(rising.growthPct || 0) >= 20 ? "high" : "medium",
      recommendation: "관련 고객의 진료 분야와 연결해 콘텐츠 주제를 검토하세요.",
      actionLabel: "트렌드 보기",
      actionHref: "/trend-dashboard",
    });
  }
  const competitor = trend?.competitorTable?.[0];
  if (competitor?.hospitalName) {
    items.push({
      id: `competitor:${competitor.id || competitor.hospitalName}`,
      category: "competitor",
      title: `${competitor.hospitalName} 채널 변화 확인`,
      summary: "최근 경쟁 병원 채널 데이터를 고객의 현재 콘텐츠와 비교해 볼 수 있습니다.",
      source: "경쟁 병원 모니터링",
      importance: "medium",
      recommendation: "사진 구성과 콘텐츠 발행 흐름의 차이를 확인하세요.",
      actionLabel: "전략 비교",
      actionHref: "/trend-dashboard",
    });
  }
  const insight = trend?.latestInsight;
  if (insight) {
    const summary = insight.summary || insight.insight || insight.content;
    if (summary) {
      items.push({
        id: `insight:${insight.id || insight.created_at || "latest"}`,
        category: "market",
        title: insight.title || "최신 병원 시장 인사이트",
        summary: String(summary),
        source: "AI 트렌드 인사이트",
        publishedAt: insight.created_at ? new Date(insight.created_at).toLocaleDateString("ko-KR") : undefined,
        importance: "medium",
        recommendation: insight.recommendation || "현재 고객 전략에 적용할 지점을 확인하세요.",
        actionLabel: "전체 분석",
        actionHref: "/trend-dashboard",
      });
    }
  }
  const todayIdea = ideas?.ideas?.[0];
  if (todayIdea?.marketing_idea?.title) {
    items.push({
      id: `idea:${todayIdea.date || "latest"}`,
      category: "content_insight",
      title: todayIdea.marketing_idea.title,
      summary: todayIdea.marketing_idea.body || "오늘 바로 실행할 수 있는 병원 마케팅 아이디어입니다.",
      source: "오늘의 아이디어",
      publishedAt: todayIdea.date,
      importance: "medium",
      recommendation: todayIdea.marketing_idea.action,
      actionLabel: "콘텐츠 만들기",
      actionHref: "/daily-ideas",
    });
  }
  return items;
}

export default function MarketingBriefing() {
  const [items, setItems] = useState<MarketingItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    try {
      setSavedIds(new Set(JSON.parse(localStorage.getItem("olivia-marketing-briefing-saved") || "[]")));
    } catch {
      setSavedIds(new Set());
    }

    const controller = new AbortController();
    Promise.all([
      fetch("/api/trend/dashboard", { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : null),
      fetch("/api/daily-ideas?limit=1", { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : null),
    ])
      .then(([trend, ideas]) => {
        const liveItems = buildLiveItems(trend, ideas);
        const fallbackNeeded = liveItems.length < 5;
        const merged = [
          ...liveItems,
          ...(fallbackNeeded ? FALLBACK_MARKETING_BRIEFING.filter((fallback) =>
            !liveItems.some((item) => item.category === fallback.category)
          ) : []),
        ].slice(0, 5);
        setItems(merged.length ? merged : FALLBACK_MARKETING_BRIEFING);
        setUsingFallback(fallbackNeeded);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setItems(FALLBACK_MARKETING_BRIEFING);
        setUsingFallback(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const visibleItems = useMemo(
    () => items.filter((item) => filter === "all" || item.category === filter).slice(0, 3),
    [filter, items],
  );

  function toggleSaved(id: string) {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("olivia-marketing-briefing-saved", JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <section className="home-briefing-panel home-marketing-briefing" aria-labelledby="marketing-briefing-title">
      <header className="home-briefing-panel__head">
        <div>
          <span className="home-briefing-panel__eyebrow"><Megaphone size={14}/> MARKETING NOW</span>
          <h2 id="marketing-briefing-title">마케팅 브리핑</h2>
          <p>병원 마케팅에 영향을 주는 최신 정보와 실행 아이디어입니다.</p>
        </div>
        <Link href="/marketing">전체 보기</Link>
      </header>

      <div className="home-briefing-filters" aria-label="마케팅 브리핑 필터">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={filter === option.value ? "is-active" : undefined}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="home-briefing-loading" role="status"><span/><span/><span/></div>
      ) : visibleItems.length ? (
        <div className="home-marketing-list">
          {visibleItems.map((item) => (
            <MarketingBriefingItem key={item.id} item={item} saved={savedIds.has(item.id)} onSave={toggleSaved}/>
          ))}
        </div>
      ) : (
        <div className="home-marketing-empty">선택한 카테고리의 브리핑이 아직 없습니다.</div>
      )}

      {usingFallback && !loading ? <p className="home-marketing-source-note">수집 데이터가 없는 항목은 올리비아 기본 가이드로 보완했습니다.</p> : null}
    </section>
  );
}
