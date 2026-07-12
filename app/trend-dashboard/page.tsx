"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import {
  TrendingUp, RefreshCw, Sparkles, Hash, Users, Youtube, Instagram, Plus, X, Trash2,
} from "lucide-react";
import { TREND_INDUSTRIES } from "@/lib/trend/constants";

const SERIES_COLORS = ["#155855", "#E85D2C", "#0891B2", "#9333EA", "#D97706", "#059669"];

type DashboardData = {
  industry: string;
  summary: { topKeyword: string | null; risingHashtag: string | null; hospitalToWatch: string | null };
  keywordSeries: Record<string, { date: string; value: number }[]>;
  hashtagRanking: { hashtag: string; count: number }[];
  postTypeBreakdown: { type: string; count: number }[];
  competitorTable: {
    id: string; hospitalName: string; industry: string;
    instagram: { followers: number; postsCount: number; avgEngagement: number; growthPct: number; snapshotDate: string } | null;
    youtube: { followers: number; postsCount: number; avgEngagement: number; growthPct: number; snapshotDate: string } | null;
  }[];
  latestInsight: { id: string; summary: string; highlights: string[]; created_at: string; period_start: string; period_end: string } | null;
  dataAvailable: boolean;
};

function mergeKeywordSeries(series: Record<string, { date: string; value: number }[]>) {
  const dateSet = new Set<string>();
  Object.values(series).forEach((points) => points.forEach((p) => dateSet.add(p.date)));
  const dates = [...dateSet].sort();
  return dates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const [keyword, points] of Object.entries(series)) {
      const found = points.find((p) => p.date === date);
      if (found) row[keyword] = found.value;
    }
    return row;
  });
}

export default function TrendDashboardPage() {
  const [industry, setIndustry] = useState<string>("all");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [generatingInsight, setGeneratingInsight] = useState(false);
  const [showAddCompetitor, setShowAddCompetitor] = useState(false);
  const [addingCompetitor, setAddingCompetitor] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState({
    hospitalName: "", industry: "기타", instagramHandle: "", youtubeChannelId: "",
  });

  const load = useCallback(async (ind: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trend/dashboard?industry=${ind}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(industry); }, [industry, load]);

  const runCollect = async () => {
    setCollecting(true);
    try {
      await fetch("/api/trend/collect", { method: "POST" });
      await load(industry);
    } finally {
      setCollecting(false);
    }
  };

  const runInsight = async () => {
    setGeneratingInsight(true);
    try {
      await fetch("/api/trend/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry }),
      });
      await load(industry);
    } finally {
      setGeneratingInsight(false);
    }
  };

  const submitCompetitor = async () => {
    if (!newCompetitor.hospitalName.trim()) return;
    setAddingCompetitor(true);
    try {
      const res = await fetch("/api/trend/competitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCompetitor),
      });
      if (res.ok) {
        setNewCompetitor({ hospitalName: "", industry: "기타", instagramHandle: "", youtubeChannelId: "" });
        setShowAddCompetitor(false);
        await load(industry);
      }
    } finally {
      setAddingCompetitor(false);
    }
  };

  const deleteCompetitor = async (id: string) => {
    if (!confirm("이 경쟁 병원을 삭제할까요?")) return;
    await fetch(`/api/trend/competitor?id=${id}`, { method: "DELETE" });
    await load(industry);
  };

  const chartRows = data ? mergeKeywordSeries(data.keywordSeries) : [];
  const keywordNames = data ? Object.keys(data.keywordSeries).slice(0, 6) : [];

  return (
    <div style={{ minHeight: "100vh", background: "#EDF5F3" }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <Link href="/" className="pc-header-back">← 관리자 홈</Link>
          <div className="pc-header-divider" />
          <div className="pc-header-brand">
            <TrendingUp size={20} color="#155855" />
            <span className="pc-header-title">병원 트렌드 분석</span>
          </div>
        </div>
        <div className="pc-header-actions">
          <button
            onClick={runCollect}
            disabled={collecting}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 10, border: "1.5px solid #155855",
              background: collecting ? "#EDF5F3" : "#155855", color: collecting ? "#155855" : "#fff",
              fontWeight: 800, fontSize: 13, cursor: collecting ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw size={14} className={collecting ? "spin" : ""} />
            {collecting ? "수집 중..." : "지금 수집"}
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px 60px" }}>

        {/* ── 업종 탭 ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {[{ key: "all", label: "전체" }, ...TREND_INDUSTRIES.map((i) => ({ key: i, label: i }))].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setIndustry(tab.key)}
              style={{
                padding: "9px 18px", borderRadius: 999, fontSize: 13, fontWeight: 800, cursor: "pointer",
                border: `1.5px solid ${industry === tab.key ? "#155855" : "#C8DDD9"}`,
                background: industry === tab.key ? "#155855" : "#fff",
                color: industry === tab.key ? "#fff" : "#155855",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!data?.dataAvailable && !loading && (
          <div style={{
            background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 12,
            padding: "16px 20px", marginBottom: 20, fontSize: 13, color: "#9A3412", lineHeight: 1.7,
          }}>
            아직 수집된 데이터가 없어요. 네이버/유튜브/Apify API 키가 설정되어 있다면 우측 상단 <b>&quot;지금 수집&quot;</b> 버튼으로 첫 수집을 실행해보세요.
            (키 미설정 시 해당 소스는 자동으로 건너뜁니다 — 구글 트렌드는 키 없이도 수집됩니다.)
          </div>
        )}

        {/* ── 요약 카드 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 24 }}>
          <SummaryCard icon={<TrendingUp size={16} />} label="이번 주 인기 키워드" value={data?.summary.topKeyword || "—"} />
          <SummaryCard icon={<Hash size={16} />} label="급상승 해시태그" value={data?.summary.risingHashtag ? `#${data.summary.risingHashtag}` : "—"} />
          <SummaryCard icon={<Users size={16} />} label="주목할 병원" value={data?.summary.hospitalToWatch || "—"} />
        </div>

        {/* ── 키워드 트렌드 차트 ── */}
        <SectionCard title="키워드 검색량 트렌드" desc="네이버 데이터랩 · 구글 트렌드">
          {chartRows.length === 0 ? (
            <EmptyState text="키워드 데이터가 아직 없습니다." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4EEEC" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {keywordNames.map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* ── SNS 트렌드 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginTop: 16 }}>
          <SectionCard title="게시물 유형 분포" desc="인스타그램 · 유튜브">
            {!data || data.postTypeBreakdown.length === 0 ? (
              <EmptyState text="SNS 게시물 데이터가 아직 없습니다." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.postTypeBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4EEEC" />
                  <XAxis dataKey="type" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#155855" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title="해시태그 랭킹" desc="최근 60일">
            {!data || data.hashtagRanking.length === 0 ? (
              <EmptyState text="해시태그 데이터가 아직 없습니다." />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {data.hashtagRanking.map((h, i) => (
                  <div key={h.hashtag} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                    <span style={{ width: 20, color: "#9BB5B0", fontWeight: 800 }}>{i + 1}</span>
                    <span style={{ flex: 1, color: "#155855", fontWeight: 700 }}>#{h.hashtag}</span>
                    <span style={{ color: "#7A9E9B", fontSize: 12 }}>{h.count}건</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── 경쟁사 비교 테이블 ── */}
        <SectionCard title="경쟁 병원 SNS 비교" desc="팔로워 · 게시물 수 · 증감률" style={{ marginTop: 16 }}>
          {!data || data.competitorTable.length === 0 ? (
            <EmptyState text="등록된 경쟁 병원이 없습니다. trend_competitors 테이블에 병원을 등록해주세요." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#EDF5F3" }}>
                    {["병원", "플랫폼", "팔로워", "게시물수", "증감률"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "9px 12px", color: "#155855", fontWeight: 800, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.competitorTable.flatMap((c) =>
                    [
                      c.instagram && { platform: "instagram" as const, row: c.instagram },
                      c.youtube && { platform: "youtube" as const, row: c.youtube },
                    ]
                      .filter(Boolean)
                      .map((entry, idx) => {
                        const { platform, row } = entry as { platform: "instagram" | "youtube"; row: NonNullable<typeof c.instagram> };
                        return (
                          <tr key={`${c.id}-${platform}`} style={{ borderTop: "1px solid #EDF5F3" }}>
                            {idx === 0 && (
                              <td rowSpan={(c.instagram ? 1 : 0) + (c.youtube ? 1 : 0)} style={{ padding: "9px 12px", fontWeight: 700, color: "#1C2B28", verticalAlign: "top" }}>
                                {c.hospitalName}
                              </td>
                            )}
                            <td style={{ padding: "9px 12px" }}>
                              {platform === "instagram" ? <Instagram size={14} color="#E85D2C" /> : <Youtube size={14} color="#DC2626" />}
                            </td>
                            <td style={{ padding: "9px 12px" }}>{row.followers.toLocaleString()}</td>
                            <td style={{ padding: "9px 12px" }}>{row.postsCount.toLocaleString()}</td>
                            <td style={{ padding: "9px 12px", fontWeight: 800, color: row.growthPct > 0 ? "#059669" : row.growthPct < 0 ? "#DC2626" : "#9BB5B0" }}>
                              {row.growthPct > 0 ? "+" : ""}{row.growthPct.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ── AI 인사이트 ── */}
        <SectionCard
          title="AI 인사이트"
          desc={data?.latestInsight ? `${data.latestInsight.period_start} ~ ${data.latestInsight.period_end}` : "Claude 분석"}
          style={{ marginTop: 16 }}
          action={
            <button
              onClick={runInsight}
              disabled={generatingInsight}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, border: "1.5px solid #E85D2C",
                background: generatingInsight ? "#fff" : "rgba(232,93,44,0.08)", color: "#E85D2C",
                fontWeight: 800, fontSize: 12, cursor: generatingInsight ? "not-allowed" : "pointer",
              }}
            >
              <Sparkles size={13} />
              {generatingInsight ? "생성 중..." : data?.latestInsight ? "다시 생성" : "인사이트 생성"}
            </button>
          }
        >
          {!data?.latestInsight ? (
            <EmptyState text="아직 생성된 인사이트가 없습니다. 데이터 수집 후 위 버튼으로 생성해보세요." />
          ) : (
            <div>
              <p style={{ fontSize: 14, color: "#1C2B28", lineHeight: 1.7, margin: "0 0 12px" }}>{data.latestInsight.summary}</p>
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                {data.latestInsight.highlights.map((h, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#3A5450", lineHeight: 1.6 }}>{h}</li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      </div>

      <style jsx global>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #C8DDD9", padding: "16px 18px", boxShadow: "0 2px 10px rgba(21,88,85,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#7A9E9B", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, color: "#155855", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function SectionCard({
  title, desc, children, style, action,
}: { title: string; desc?: string; children: React.ReactNode; style?: React.CSSProperties; action?: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #C8DDD9", padding: "18px 20px", boxShadow: "0 2px 12px rgba(21,88,85,0.06)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#1C2B28" }}>{title}</div>
          {desc && <div style={{ fontSize: 11, color: "#9BB5B0", marginTop: 2 }}>{desc}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: "32px 12px", textAlign: "center", color: "#9BB5B0", fontSize: 13 }}>{text}</div>
  );
}
