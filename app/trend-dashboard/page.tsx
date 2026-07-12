"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import {
  TrendingUp, RefreshCw, Sparkles, Hash, Users, Youtube, Instagram, Plus, X, Trash2, Search,
} from "lucide-react";
import { TREND_INDUSTRIES } from "@/lib/trend/constants";

const SERIES_COLORS = ["#155855", "#E85D2C", "#0891B2", "#9333EA", "#D97706", "#059669"];

type PlatformBreakdown = {
  postCount: number;
  typeBreakdown: { type: string; count: number }[];
  avgLikes: number;
  avgComments: number;
  avgViews: number;
  topPosts: { id: string; url: string; caption: string; likes: number; comments: number; views: number; postType: string; hospitalName: string }[];
};

type DashboardData = {
  industry: string;
  summary: { topKeyword: string | null; risingHashtag: string | null; hospitalToWatch: string | null };
  keywordSeries: Record<string, { date: string; value: number }[]>;
  topKeywords: { keyword: string; value: number }[];
  risingKeywords: { keyword: string; value: number; growthPct: number }[];
  hashtagRanking: { hashtag: string; count: number }[];
  postBreakdownByPlatform: { instagram: PlatformBreakdown; youtube: PlatformBreakdown };
  competitorTable: {
    id: string; hospitalName: string; industry: string;
    instagram: { followers: number; postsCount: number; avgEngagement: number; growthPct: number; snapshotDate: string } | null;
    youtube: { followers: number; postsCount: number; avgEngagement: number; growthPct: number; snapshotDate: string } | null;
  }[];
  latestInsight: { id: string; summary: string; highlights: string[]; created_at: string; period_start: string; period_end: string } | null;
  dataAvailable: boolean;
};

type KeywordAnalysis = {
  keyword: string;
  searchVolumeTrend: { date: string; value: number }[];
  postCount: number;
  platformCounts: { instagram: number; youtube: number };
  topPosts: { id: string; url: string; platform: string; caption: string; likes: number; comments: number; views: number; postType: string; hospitalName: string }[];
  aiSummary: string;
  aiError: string | null;
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
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordAnalysis, setKeywordAnalysis] = useState<KeywordAnalysis | null>(null);
  const [searchingKeyword, setSearchingKeyword] = useState(false);

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

  const searchKeyword = async () => {
    const kw = keywordInput.trim();
    if (!kw) return;
    setSearchingKeyword(true);
    try {
      const res = await fetch(`/api/trend/keyword-analysis?keyword=${encodeURIComponent(kw)}`);
      const json = await res.json();
      setKeywordAnalysis(json.ok ? json : null);
    } finally {
      setSearchingKeyword(false);
    }
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

        {/* ── 진료과 선택 ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#7A9E9B" }}>진료과</span>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            style={{
              height: 40, padding: "0 14px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer",
              border: "1.5px solid #155855", background: "#fff", color: "#155855", minWidth: 220,
            }}
          >
            <option value="all">전체</option>
            {TREND_INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
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

        {/* ── 요약: 인기/급상승 키워드 TOP5 + 주목할 병원 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 24 }}>
          <RankCard
            icon={<TrendingUp size={16} />}
            title="이번 주 인기 키워드"
            items={(data?.topKeywords || []).map((k) => ({ label: k.keyword, value: k.value.toLocaleString() }))}
            emptyText="키워드 데이터가 아직 없습니다."
          />
          <RankCard
            icon={<Hash size={16} />}
            title="급상승 키워드"
            items={(data?.risingKeywords || []).map((k) => ({
              label: k.keyword, value: `${k.growthPct > 0 ? "+" : ""}${k.growthPct.toFixed(0)}%`,
              valueColor: k.growthPct > 0 ? "#059669" : k.growthPct < 0 ? "#DC2626" : "#9BB5B0",
            }))}
            emptyText="비교할 만큼 데이터가 쌓이지 않았습니다 (최소 2회 수집 필요)."
          />
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #C8DDD9", padding: "16px 18px", boxShadow: "0 2px 10px rgba(21,88,85,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#7A9E9B", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              <Users size={16} /> 주목할 병원
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#155855", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {data?.summary.hospitalToWatch || "—"}
            </div>
            {!data?.summary.hospitalToWatch && (
              <div style={{ fontSize: 11, color: "#9BB5B0", marginTop: 6, lineHeight: 1.5 }}>
                경쟁 병원을 등록하고 &quot;지금 수집&quot;을 실행하면 SNS 팔로워 성장률 1위 병원이 여기 표시됩니다.
              </div>
            )}
          </div>
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

        {/* ── 키워드 단건 분석 ── */}
        <SectionCard title="키워드 분석" desc="특정 키워드의 검색량 추이 + 관련 SNS 게시물 분석" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: keywordAnalysis ? 16 : 0 }}>
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") searchKeyword(); }}
              placeholder="예: 리프팅 시술, 임플란트, 무릎 통증..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={searchKeyword}
              disabled={searchingKeyword || !keywordInput.trim()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "0 18px", borderRadius: 8, border: "none", height: 38,
                background: !keywordInput.trim() ? "#C8DDD9" : "#155855", color: "#fff",
                fontWeight: 800, fontSize: 13, cursor: !keywordInput.trim() ? "not-allowed" : "pointer",
              }}
            >
              <Search size={14} />
              {searchingKeyword ? "분석 중..." : "분석"}
            </button>
          </div>

          {keywordAnalysis && (
            <div>
              <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
                <Stat label="관련 게시물" value={`${keywordAnalysis.postCount}건`} />
                <Stat label="인스타그램" value={`${keywordAnalysis.platformCounts.instagram}건`} />
                <Stat label="유튜브" value={`${keywordAnalysis.platformCounts.youtube}건`} />
              </div>

              {keywordAnalysis.aiSummary && (
                <div style={{ background: "#EDF5F3", borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 13, color: "#1C2B28", lineHeight: 1.7 }}>
                  <Sparkles size={13} color="#E85D2C" style={{ marginRight: 6, verticalAlign: -2 }} />
                  {keywordAnalysis.aiSummary}
                </div>
              )}
              {keywordAnalysis.aiError && (
                <div style={{ fontSize: 12, color: "#9BB5B0", marginBottom: 14 }}>AI 분석 생성 실패: {keywordAnalysis.aiError}</div>
              )}

              {keywordAnalysis.topPosts.length === 0 ? (
                <EmptyState text="이 키워드와 관련된 게시물이 아직 없습니다." />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {keywordAnalysis.topPosts.map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                      borderRadius: 8, background: "#F7FAFA", textDecoration: "none",
                    }}>
                      {p.platform === "instagram" ? <Instagram size={14} color="#E85D2C" /> : <Youtube size={14} color="#DC2626" />}
                      <span style={{ flex: 1, fontSize: 13, color: "#1C2B28", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.caption || "(캡션 없음)"}</span>
                      <span style={{ fontSize: 11, color: "#7A9E9B" }}>❤ {p.likes.toLocaleString()}{p.views > 0 ? ` · 조회 ${p.views.toLocaleString()}` : ""}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* ── SNS 트렌드: 인스타그램 / 유튜브 분리 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16, marginTop: 16, alignItems: "start" }}>
          <PlatformCard
            title="인스타그램 게시물 분석"
            icon={<Instagram size={14} color="#E85D2C" />}
            data={data?.postBreakdownByPlatform.instagram}
            engagementLabel="평균 좋아요"
            engagementValue={data?.postBreakdownByPlatform.instagram.avgLikes}
          />
          <PlatformCard
            title="유튜브 게시물 분석"
            icon={<Youtube size={14} color="#DC2626" />}
            data={data?.postBreakdownByPlatform.youtube}
            engagementLabel="평균 조회수"
            engagementValue={data?.postBreakdownByPlatform.youtube.avgViews}
          />
        </div>

        <SectionCard title="해시태그 랭킹" desc="최근 60일" style={{ marginTop: 16 }}>
          {!data || data.hashtagRanking.length === 0 ? (
            <EmptyState text="해시태그 데이터가 아직 없습니다." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
              {data.hashtagRanking.map((h, i) => (
                <div key={h.hashtag} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ width: 20, color: "#9BB5B0", fontWeight: 800 }}>{i + 1}</span>
                  <span style={{ flex: 1, color: "#155855", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>#{h.hashtag}</span>
                  <span style={{ color: "#7A9E9B", fontSize: 12 }}>{h.count}건</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── 경쟁사 비교 테이블 ── */}
        <SectionCard
          title="경쟁 병원 SNS 비교"
          desc="팔로워 · 게시물 수 · 증감률"
          style={{ marginTop: 16 }}
          action={
            <button
              onClick={() => setShowAddCompetitor((v) => !v)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, border: "1.5px solid #155855",
                background: showAddCompetitor ? "#EDF5F3" : "rgba(21,88,85,0.08)", color: "#155855",
                fontWeight: 800, fontSize: 12, cursor: "pointer",
              }}
            >
              {showAddCompetitor ? <X size={13} /> : <Plus size={13} />}
              {showAddCompetitor ? "닫기" : "병원 추가"}
            </button>
          }
        >
          {showAddCompetitor && (
            <div style={{
              display: "grid", gridTemplateColumns: "1.2fr 0.9fr 1fr 1fr auto", gap: 8, alignItems: "end",
              background: "#EDF5F3", borderRadius: 10, padding: 14, marginBottom: 16,
            }}>
              <Field label="병원명 *">
                <input
                  value={newCompetitor.hospitalName}
                  onChange={(e) => setNewCompetitor((v) => ({ ...v, hospitalName: e.target.value }))}
                  placeholder="예: OO성형외과"
                  style={inputStyle}
                />
              </Field>
              <Field label="업종">
                <select
                  value={newCompetitor.industry}
                  onChange={(e) => setNewCompetitor((v) => ({ ...v, industry: e.target.value }))}
                  style={inputStyle}
                >
                  {TREND_INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="인스타그램 아이디 (@ 제외)">
                <input
                  value={newCompetitor.instagramHandle}
                  onChange={(e) => setNewCompetitor((v) => ({ ...v, instagramHandle: e.target.value }))}
                  placeholder="username"
                  style={inputStyle}
                />
              </Field>
              <Field label="유튜브 채널 ID (UC로 시작)">
                <input
                  value={newCompetitor.youtubeChannelId}
                  onChange={(e) => setNewCompetitor((v) => ({ ...v, youtubeChannelId: e.target.value }))}
                  placeholder="UCxxxxxxxx"
                  style={inputStyle}
                />
              </Field>
              <button
                onClick={submitCompetitor}
                disabled={addingCompetitor || !newCompetitor.hospitalName.trim()}
                style={{
                  padding: "9px 16px", borderRadius: 8, border: "none", height: 38,
                  background: !newCompetitor.hospitalName.trim() ? "#C8DDD9" : "#155855", color: "#fff",
                  fontWeight: 800, fontSize: 12, cursor: !newCompetitor.hospitalName.trim() ? "not-allowed" : "pointer",
                }}
              >
                {addingCompetitor ? "등록 중..." : "등록"}
              </button>
              <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#7A9E9B" }}>
                등록 후 SNS 팔로워/게시물 데이터는 다음 &quot;지금 수집&quot; 실행 시 채워집니다. 인스타/유튜브는 둘 다 선택 입력(비워두면 해당 플랫폼은 수집 안 함).
              </div>
            </div>
          )}

          {!data || data.competitorTable.length === 0 ? (
            <EmptyState text="등록된 경쟁 병원이 없습니다. 위 &quot;병원 추가&quot; 버튼으로 등록해주세요." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#EDF5F3" }}>
                    {["병원", "플랫폼", "팔로워", "게시물수", "증감률", ""].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "9px 12px", color: "#155855", fontWeight: 800, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.competitorTable.map((c) => {
                    const platforms = [
                      c.instagram && { platform: "instagram" as const, row: c.instagram },
                      c.youtube && { platform: "youtube" as const, row: c.youtube },
                    ].filter(Boolean) as { platform: "instagram" | "youtube"; row: NonNullable<typeof c.instagram> }[];

                    if (platforms.length === 0) {
                      return (
                        <tr key={c.id} style={{ borderTop: "1px solid #EDF5F3" }}>
                          <td style={{ padding: "9px 12px", fontWeight: 700, color: "#1C2B28" }}>{c.hospitalName}</td>
                          <td colSpan={3} style={{ padding: "9px 12px", color: "#9BB5B0", fontSize: 12 }}>수집 대기중 — &quot;지금 수집&quot; 실행 후 표시됩니다</td>
                          <td />
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>
                            <button onClick={() => deleteCompetitor(c.id)} style={deleteBtnStyle}><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      );
                    }

                    return platforms.map((entry, idx) => {
                      const { platform, row } = entry;
                      return (
                        <tr key={`${c.id}-${platform}`} style={{ borderTop: "1px solid #EDF5F3" }}>
                          {idx === 0 && (
                            <td rowSpan={platforms.length} style={{ padding: "9px 12px", fontWeight: 700, color: "#1C2B28", verticalAlign: "top" }}>
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
                          {idx === 0 && (
                            <td rowSpan={platforms.length} style={{ padding: "9px 12px", textAlign: "right", verticalAlign: "top" }}>
                              <button onClick={() => deleteCompetitor(c.id)} style={deleteBtnStyle}><Trash2 size={13} /></button>
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })}
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

function RankCard({
  icon, title, items, emptyText,
}: { icon: React.ReactNode; title: string; items: { label: string; value: string; valueColor?: string }[]; emptyText: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #C8DDD9", padding: "16px 18px", boxShadow: "0 2px 10px rgba(21,88,85,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#7A9E9B", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
        {icon} {title}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "#9BB5B0", lineHeight: 1.5 }}>{emptyText}</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {items.map((it, i) => (
            <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ width: 16, color: "#9BB5B0", fontWeight: 800, fontSize: 11 }}>{i + 1}</span>
              <span style={{ flex: 1, color: "#1C2B28", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
              <span style={{ color: it.valueColor || "#155855", fontWeight: 800, fontSize: 12 }}>{it.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#9BB5B0", fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: "#155855" }}>{value}</div>
    </div>
  );
}

function PlatformCard({
  title, icon, data, engagementLabel, engagementValue,
}: {
  title: string; icon: React.ReactNode; data?: PlatformBreakdown;
  engagementLabel: string; engagementValue?: number;
}) {
  return (
    <SectionCard title={title} desc={data ? `게시물 ${data.postCount}건` : undefined}>
      {!data || data.postCount === 0 ? (
        <EmptyState text="게시물 데이터가 아직 없습니다." />
      ) : (
        <div>
          <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
            <Stat label="게시물 수" value={`${data.postCount}건`} />
            <Stat label={engagementLabel} value={(engagementValue ?? 0).toLocaleString()} />
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data.typeBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4EEEC" />
              <XAxis dataKey="type" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#155855" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "grid", gap: 6, marginTop: 14 }}>
            {data.topPosts.slice(0, 3).map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                borderRadius: 8, background: "#F7FAFA", textDecoration: "none", fontSize: 12,
              }}>
                {icon}
                <span style={{ flex: 1, color: "#1C2B28", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.caption || "(캡션 없음)"}</span>
                <span style={{ color: "#7A9E9B" }}>❤ {p.likes.toLocaleString()}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#7A9E9B" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  height: 38, padding: "0 10px", borderRadius: 8, border: "1.5px solid #C8DDD9",
  fontSize: 13, color: "#1C2B28", background: "#fff", outline: "none",
};

const deleteBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, borderRadius: 6, border: "1px solid #FECACA",
  background: "#FEF2F2", color: "#DC2626", cursor: "pointer",
};
