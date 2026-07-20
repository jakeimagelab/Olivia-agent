"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Lightbulb, TrendingUp } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import CategorySection from "@/components/admin/CategorySection";
import { TOOLS_CONTENT, type ToolDef } from "@/lib/toolNav";

function ToolCard({ tool }: { tool: ToolDef }) {
  const Icon = tool.icon;
  return (
    <Link href={tool.href} className={`admin-menu-card${tool.orange ? " orange" : ""}`}>
      <div className="admin-menu-icon"><Icon size={26} /></div>
      <div className="admin-menu-copy">
        <span>{tool.meta}</span>
        <h2>{tool.title}</h2>
        <p>{tool.desc}</p>
      </div>
      <div className="admin-menu-action" aria-hidden="true"><ArrowRight size={21} /></div>
    </Link>
  );
}

function TodayIdeaBrief() {
  const [idea, setIdea] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/daily-ideas?limit=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setIdea(json?.ideas?.[0] ?? null))
      .catch(() => setIdea(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mkt-brief-card">
      <div className="mkt-brief-head"><Lightbulb size={15} /> 오늘의 아이디어</div>
      {loading ? (
        <p className="mkt-brief-empty">불러오는 중…</p>
      ) : !idea ? (
        <p className="mkt-brief-empty">아직 생성된 아이디어가 없어요.</p>
      ) : (
        <>
          <p className="mkt-brief-title">{idea.marketing_idea?.title ?? "오늘의 마케팅 아이디어"}</p>
          <p className="mkt-brief-desc">{idea.marketing_idea?.body ?? ""}</p>
        </>
      )}
      <Link href="/daily-ideas" className="mkt-brief-link">전체 보기 →</Link>
    </div>
  );
}

function TrendKeywordBrief() {
  const [keywords, setKeywords] = useState<{ keyword: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trend/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setKeywords((json?.topKeywords ?? []).slice(0, 5)))
      .catch(() => setKeywords([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mkt-brief-card">
      <div className="mkt-brief-head"><TrendingUp size={15} /> 최근 트렌드 키워드</div>
      {loading ? (
        <p className="mkt-brief-empty">불러오는 중…</p>
      ) : keywords.length === 0 ? (
        <p className="mkt-brief-empty">수집된 키워드가 아직 없어요.</p>
      ) : (
        <ul className="mkt-brief-keywords">
          {keywords.map((k, i) => (
            <li key={i}>{k.keyword}</li>
          ))}
        </ul>
      )}
      <Link href="/trend-dashboard" className="mkt-brief-link">전체 보기 →</Link>
    </div>
  );
}

export default function MarketingDashboardPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--mesh-bg)" }}>
      <PageHeader title="마케팅 대시보드" />
      <div className="oa-page oa-tools-page">
        <div className="mkt-brief-row">
          <TodayIdeaBrief />
          <TrendKeywordBrief />
        </div>

        <CategorySection
          eyebrow="MARKETING TOOLS"
          title="홍보 & 분석 도구"
          description="트렌드 파악부터 콘텐츠 제작, 신뢰도 진단까지 — 흩어져 있던 마케팅 도구를 한 곳에 모았습니다."
        >
          <div className="admin-menu-grid">
            {TOOLS_CONTENT.map((tool) => <ToolCard key={tool.href} tool={tool} />)}
          </div>
        </CategorySection>
      </div>
    </main>
  );
}
