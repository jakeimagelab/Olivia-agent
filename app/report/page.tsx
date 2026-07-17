"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity, BarChart2, RefreshCw, TrendingUp
} from "lucide-react";

type ReportData = {
  total: number;
  counts: Record<string, number>;
  recent: { type: string; hospital: string; time: string; details: any }[];
  hospitalRanking: { name: string; count: number }[];
  chartData: { date: string; count: number }[];
  period: string;
};

const ACTION_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  create_quote:    { label: "견적서 생성",  icon: "📄", color: "#155855", bg: "#EAF4F2" },
  create_conti:    { label: "콘티 작성",   icon: "🎬", color: "#E85D2C", bg: "#FFF0EB" },
  send_file:       { label: "파일 전송",   icon: "📦", color: "#7C3AED", bg: "#F5F3FF" },
  create_contract: { label: "계약서 발행", icon: "✍️", color: "#0369A1", bg: "#E0F2FE" },
  create_website:  { label: "홈페이지",    icon: "🌐", color: "#065F46", bg: "#D1FAE5" },
  olivia_chat:     { label: "AI 대화",     icon: "✨", color: "#92400E", bg: "#FEF3C7" },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [period, setPeriod] = useState<"week" | "month" | "all">("week");
  const [loading, setLoading] = useState(true);

  const load = async (p = period) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/report?period=${p}`);
      const json = await res.json();
      if (json.ok) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const changePeriod = (p: "week" | "month" | "all") => {
    setPeriod(p);
    load(p);
  };

  const maxChart = data ? Math.max(...data.chartData.map(d => d.count), 1) : 1;

  return (
    <div style={{ minHeight: "100vh", background: "#F0F9F8" }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="/assets/photoclinic-logo.png" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">업무 리포트</span>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "18px 20px 48px" }}>

        {/* 타이틀 + 기간 선택 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#155855" }}>업무 리포트</h1>
          <div style={{ display: "flex", gap: 6 }}>
            {(["week","month","all"] as const).map(p => (
              <button key={p} onClick={() => changePeriod(p)} className={`pc-btn pc-btn--sm ${period === p ? "pc-btn--primary" : "pc-btn--secondary"}`}>
                {p === "week" ? "7일" : p === "month" ? "30일" : "전체"}
              </button>
            ))}
            <button onClick={() => load()} className="pc-btn pc-btn--secondary pc-btn--sm">
              <RefreshCw size={14} color="#155855" style={{ animation: loading ? "spin .8s linear infinite" : "none" }} />
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#5A7470" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>데이터를 불러오는 중...</div>
          </div>
        ) : data ? (
          <>
            {/* 지표 6개: 총계 포함 한 줄 그리드 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 16 }}>
              <div style={{
                background: "linear-gradient(135deg, #155855, #1e7870)",
                borderRadius: 10, padding: "12px 14px",
                boxShadow: "0 4px 12px rgba(21,88,85,.18)",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.65)" }}>총 활동</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", lineHeight: 1.2, margin: "2px 0" }}>{data.total}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,.7)" }}>건</div>
              </div>

              {(["create_quote","create_conti","send_file","create_contract","create_website","olivia_chat"] as const).map(key => {
                const meta = ACTION_META[key];
                const count = data.counts[key] || 0;
                return (
                  <div key={key} className="pc-card" style={{ padding: "12px 14px" }}>
                    <div style={{ fontSize: 15, marginBottom: 4 }}>{meta.icon}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: meta.color }}>{count}</div>
                    <div style={{ fontSize: 10, color: "#5A7470", marginTop: 2 }}>{meta.label}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              {/* 일별 차트 */}
              <div className="pc-card" style={{ padding: "14px 14px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <BarChart2 size={13} color="#155855" />
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#155855" }}>일별 활동 추이 (7일)</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
                  {data.chartData.map((d, i) => {
                    const h = maxChart > 0 ? Math.max((d.count / maxChart) * 100, d.count > 0 ? 8 : 0) : 0;
                    const dayLabel = new Date(d.date).toLocaleDateString("ko-KR", { weekday: "short" });
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{ fontSize: 10, color: "#155855", fontWeight: 700 }}>{d.count > 0 ? d.count : ""}</div>
                        <div style={{
                          width: "100%", borderRadius: "4px 4px 0 0",
                          height: `${h}%`, minHeight: d.count > 0 ? 8 : 2,
                          background: d.count > 0 ? "linear-gradient(180deg,#E85D2C,#EB8F22)" : "#E5E7EB",
                          transition: "height .3s ease",
                        }} />
                        <div style={{ fontSize: 10, color: "#9CA3AF" }}>{dayLabel}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 병원 랭킹 */}
              <div className="pc-card" style={{ padding: "14px 14px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <TrendingUp size={13} color="#155855" />
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#155855" }}>병원별 활동 Top 5</span>
                </div>
                {data.hospitalRanking.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "16px 0", color: "#9CA3AF", fontSize: 11 }}>아직 데이터가 없어요</div>
                ) : data.hospitalRanking.map((h, i) => {
                  const max = data.hospitalRanking[0].count;
                  const pct = Math.round((h.count / max) * 100);
                  const medals = ["🥇","🥈","🥉","4️⃣","5️⃣"];
                  return (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>{medals[i]} {h.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#155855" }}>{h.count}건</span>
                      </div>
                      <div style={{ height: 4, background: "#F3F4F6", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#155855,#569082)", borderRadius: 99, transition: "width .5s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 최근 활동 로그 */}
            <div className="pc-card">
              <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(21,88,85,.08)", display: "flex", alignItems: "center", gap: 6 }}>
                <Activity size={13} color="#155855" />
                <span style={{ fontSize: 11, fontWeight: 800, color: "#155855" }}>최근 활동 로그</span>
              </div>
              {data.recent.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px", color: "#9CA3AF", fontSize: 12 }}>
                  아직 활동 기록이 없어요<br/>
                  <span style={{ fontSize: 10 }}>올리비아로 견적서·콘티·파일전송을 해보세요</span>
                </div>
              ) : data.recent.map((log, i) => {
                const meta = ACTION_META[log.type] || { label: log.type, icon: "📌", color: "#374151", bg: "#F3F4F6" };
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                    borderBottom: i < data.recent.length - 1 ? "1px solid rgba(21,88,85,.06)" : "none",
                    background: i % 2 === 0 ? "#fff" : "#FAFAFA",
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
                      {meta.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1C2B28" }}>
                        {meta.label}
                        {log.hospital && <span style={{ marginLeft: 6, fontSize: 11, color: "#5A7470", fontWeight: 400 }}>— {log.hospital}</span>}
                      </div>
                      {log.details && (
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {Object.entries(log.details).map(([k,v]) => `${k}: ${v}`).join(" · ")}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", flexShrink: 0 }}>{formatTime(log.time)}</div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#5A7470" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>데이터를 불러올 수 없어요</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Supabase 환경변수를 확인해주세요</div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
