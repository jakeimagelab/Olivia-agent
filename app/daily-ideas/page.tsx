"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const C = {
  teal: "#155855", orange: "#E85D2C",
  bg: "#EDF5F3", surface: "#FFFFFF", border: "#C8DDD9",
  muted: "#5A7470", hint: "#9BB5B0", txt: "#1C2B28", mint: "#EAF4F2",
};

type MarketingIdea = { title: string; body: string; action: string };
type ContentIdea   = { platform: string; title: string; caption_hook: string; body: string };
type CustomerTip   = { title: string; body: string; script: string };
type Mission       = { title: string; why: string; estimated_time: string };

type DailyIdea = {
  id: string; date: string;
  marketing_idea: MarketingIdea; content_ideas: ContentIdea[];
  customer_tip: CustomerTip; mission: Mission;
  trend_keywords: string[]; created_at: string;
};

const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });

function MissionBadge({ mission }: { mission: Mission }) {
  return (
    <div style={{ background: "linear-gradient(135deg,#E85D2C,#EB8F22)", borderRadius: 14, padding: "20px 24px" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.7)", letterSpacing: ".15em", textTransform: "uppercase", marginBottom: 8 }}>TODAY'S MISSION</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 8 }}>{mission.title}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,.85)", lineHeight: 1.7, marginBottom: 12 }}>{mission.why}</div>
      <span style={{ background: "rgba(255,255,255,.25)", padding: "4px 14px", borderRadius: 99, fontSize: 12, fontWeight: 700, color: "#fff" }}>⏱ {mission.estimated_time}</span>
    </div>
  );
}

function ContentCard({ idea, i }: { idea: ContentIdea; i: number }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(`${idea.title}\n\n"${idea.caption_hook}"\n\n${idea.body}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ background: i === 0 ? C.orange : C.teal, color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 99 }}>{idea.platform}</span>
        <button onClick={copy} style={{ fontSize: 11, color: copied ? "#22876A" : C.hint, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
          {copied ? "✓ 복사됨" : "복사"}
        </button>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.txt, marginBottom: 8 }}>{idea.title}</div>
      <div style={{ background: "#FFF8F5", borderLeft: `3px solid ${C.orange}`, padding: "8px 12px", borderRadius: "0 8px 8px 0", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.orange, marginBottom: 3 }}>첫 문장 훅</div>
        <div style={{ fontSize: 13, color: C.txt, fontWeight: 600 }}>"{idea.caption_hook}"</div>
      </div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>{idea.body}</div>
    </div>
  );
}

function IdeaDetail({ idea }: { idea: DailyIdea }) {
  const [scriptCopied, setScriptCopied] = useState(false);
  const copyScript = () => {
    navigator.clipboard.writeText(idea.customer_tip.script);
    setScriptCopied(true); setTimeout(() => setScriptCopied(false), 2000);
  };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: "linear-gradient(135deg,#EDF5F3,#E0F0EC)", border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: C.teal, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>📣 오늘의 마케팅 아이디어</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: C.teal, marginBottom: 10 }}>{idea.marketing_idea.title}</div>
        <div style={{ fontSize: 14, color: "#3A5450", lineHeight: 1.8, marginBottom: 14 }}>{idea.marketing_idea.body}</div>
        <div style={{ background: C.teal, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#EB8F22", fontSize: 16 }}>▶</span>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{idea.marketing_idea.action}</span>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: C.teal, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>📱 오늘의 콘텐츠 아이디어</div>
        <div style={{ display: "grid", gap: 10 }}>
          {(idea.content_ideas || []).map((ci, i) => <ContentCard key={i} idea={ci} i={i} />)}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: C.teal, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>💬 오늘의 고객 관리 팁</div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.txt, marginBottom: 8 }}>{idea.customer_tip.title}</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>{idea.customer_tip.body}</div>
          <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#22876A" }}>📨 카카오톡/문자 예시</div>
              <button onClick={copyScript} style={{ fontSize: 11, color: scriptCopied ? "#22876A" : C.hint, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                {scriptCopied ? "✓ 복사됨" : "복사"}
              </button>
            </div>
            <div style={{ fontSize: 13, color: C.txt, lineHeight: 1.7, fontStyle: "italic" }}>"{idea.customer_tip.script}"</div>
          </div>
        </div>
      </div>

      <MissionBadge mission={idea.mission} />

      {idea.trend_keywords?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.hint, fontWeight: 700 }}>트렌드</span>
          {idea.trend_keywords.map((k, i) => (
            <span key={i} style={{ background: C.mint, color: C.teal, fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 99 }}>#{k}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 날짜 목록 사이드바 ── */
function DateSidebar({ ideas, selected, today, onSelect }: {
  ideas: DailyIdea[]; selected: DailyIdea | null; today: string; onSelect: (idea: DailyIdea) => void;
}) {
  return (
    <>
      <div style={{ padding: "16px 16px 8px", fontSize: 10, fontWeight: 800, color: C.hint, letterSpacing: ".1em", textTransform: "uppercase" }}>최근 아이디어</div>
      {ideas.map(idea => {
        const isToday    = idea.date === today;
        const isSelected = selected?.id === idea.id;
        return (
          <div key={idea.id} onClick={() => onSelect(idea)} style={{
            padding: "14px 16px", borderBottom: `1px solid ${C.border}`, cursor: "pointer",
            background: isSelected ? C.mint : "transparent",
            borderLeft: isSelected ? `3px solid ${C.teal}` : "3px solid transparent",
            transition: "all .15s",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              {isToday && <span style={{ background: C.orange, color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 99 }}>오늘</span>}
              <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? C.teal : C.muted }}>{fmtDate(idea.date)}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.txt, lineHeight: 1.4, marginBottom: 4 }}>{idea.marketing_idea?.title || "아이디어"}</div>
            <div style={{ fontSize: 11, color: C.hint }}>{idea.mission?.title || ""}</div>
          </div>
        );
      })}
    </>
  );
}

export default function DailyIdeasPage() {
  const [ideas, setIdeas]         = useState<DailyIdea[]>([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected]   = useState<DailyIdea | null>(null);
  const [genMsg, setGenMsg]       = useState("");
  const [isMobile, setIsMobile]   = useState(false);
  const [mobileTab, setMobileTab] = useState<"list" | "detail">("detail");

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/daily-ideas?limit=14");
      const data = await res.json();
      if (data.ok) {
        setIdeas(data.ideas);
        if (data.ideas.length > 0 && !selected) setSelected(data.ideas[0]);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    setGenerating(true); setGenMsg("");
    try {
      const res  = await fetch("/api/daily-ideas", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setGenMsg("오늘의 아이디어가 생성됐어요!");
        await load();
        if (isMobile) setMobileTab("detail");
      } else {
        setGenMsg("생성 실패: " + data.error);
      }
    } catch (e: any) {
      setGenMsg("오류: " + e.message);
    } finally { setGenerating(false); }
  };

  const handleSelect = (idea: DailyIdea) => {
    setSelected(idea);
    if (isMobile) setMobileTab("detail");
  };

  const today     = new Date().toISOString().slice(0, 10);
  const hasToday  = !!ideas.find(i => i.date === today);

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif", color: C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <Link href="/" className="pc-header-back">← 관리자 홈</Link>
          <div className="pc-header-divider" />
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">아이디어 제안</span>
          </div>
        </div>
        <div className="pc-header-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {genMsg && <span style={{ fontSize: 12, fontWeight: 700, color: genMsg.includes("됐") ? "#22876A" : C.orange }}>{genMsg}</span>}
          <button onClick={generate} disabled={generating} style={{
            height: 36, padding: "0 16px", border: "none", borderRadius: 9,
            background: generating ? C.hint : hasToday ? C.teal : C.orange,
            color: "#fff", fontWeight: 800, fontSize: 13, cursor: generating ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}>
            {generating ? "생성 중..." : hasToday ? "재생성" : "✨ 생성"}
          </button>
        </div>
      </header>

      {/* ── 모바일 탭 바 ── */}
      {isMobile && (
        <div style={{
          display: "flex", background: C.surface,
          borderBottom: `1px solid ${C.border}`, position: "sticky", top: 56, zIndex: 50,
        }}>
          {[
            { id: "list",   label: "📅 날짜 목록" },
            { id: "detail", label: "💡 아이디어" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setMobileTab(tab.id as "list" | "detail")} style={{
              flex: 1, height: 44, border: "none", background: "transparent",
              fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: "pointer",
              color: mobileTab === tab.id ? C.teal : C.muted,
              borderBottom: mobileTab === tab.id ? `2px solid ${C.teal}` : "2px solid transparent",
              transition: "all .15s",
            }}>{tab.label}</button>
          ))}
        </div>
      )}

      {/* ── 데스크탑: 2컬럼 레이아웃 ── */}
      {!isMobile && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "calc(100vh - 56px)" }}>
          <div style={{ borderRight: `1px solid ${C.border}`, background: C.surface, overflowY: "auto", maxHeight: "calc(100vh - 56px)" }}>
            {loading && <div style={{ padding: 32, textAlign: "center", color: C.hint }}>불러오는 중...</div>}
            {!loading && ideas.length === 0 && (
              <div style={{ padding: "32px 16px", textAlign: "center", color: C.muted }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>💡</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>아이디어가 없어요</div>
                <div style={{ fontSize: 12 }}>상단 버튼으로 생성하세요</div>
              </div>
            )}
            <DateSidebar ideas={ideas} selected={selected} today={today} onSelect={setSelected} />
          </div>
          <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 56px)", padding: "24px 28px" }}>
            {!selected && !loading && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, gap: 12 }}>
                <div style={{ fontSize: 48 }}>✨</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>날짜를 선택하거나 오늘의 아이디어를 생성하세요</div>
                <div style={{ fontSize: 13 }}>클라이언트 홍보 콘텐츠 아이디어 · 매일 아침 8시 자동 생성</div>
                <button onClick={generate} disabled={generating} style={{ marginTop: 8, height: 44, padding: "0 24px", background: C.orange, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  {generating ? "생성 중..." : "✨ 지금 바로 생성하기"}
                </button>
              </div>
            )}
            {selected && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      {selected.date === today && <span style={{ background: C.orange, color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 99 }}>오늘</span>}
                      <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>{fmtDate(selected.date)}</span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: C.txt }}>{selected.marketing_idea?.title}</div>
                  </div>
                </div>
                <IdeaDetail idea={selected} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 모바일: 탭 콘텐츠 ── */}
      {isMobile && (
        <div style={{ minHeight: "calc(100vh - 100px)" }}>
          {/* 날짜 목록 탭 */}
          {mobileTab === "list" && (
            <div style={{ background: C.surface }}>
              {loading && <div style={{ padding: 32, textAlign: "center", color: C.hint }}>불러오는 중...</div>}
              {!loading && ideas.length === 0 && (
                <div style={{ padding: "48px 24px", textAlign: "center", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>💡</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>아이디어가 없어요</div>
                  <div style={{ fontSize: 13, marginBottom: 20 }}>상단 버튼으로 오늘의 아이디어를 생성하세요</div>
                  <button onClick={generate} disabled={generating} style={{ height: 44, padding: "0 24px", background: C.orange, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    ✨ 생성하기
                  </button>
                </div>
              )}
              <DateSidebar ideas={ideas} selected={selected} today={today} onSelect={handleSelect} />
            </div>
          )}

          {/* 아이디어 상세 탭 */}
          {mobileTab === "detail" && (
            <div style={{ padding: "16px 16px 80px" }}>
              {!selected && !loading && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 60, color: C.muted, gap: 12 }}>
                  <div style={{ fontSize: 48 }}>✨</div>
                  <div style={{ fontSize: 15, fontWeight: 700, textAlign: "center" }}>아이디어를 선택하거나 새로 생성하세요</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button onClick={() => setMobileTab("list")} style={{ height: 44, padding: "0 20px", background: C.teal, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                      📅 날짜 목록
                    </button>
                    <button onClick={generate} disabled={generating} style={{ height: 44, padding: "0 20px", background: C.orange, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                      {generating ? "생성 중..." : "✨ 생성하기"}
                    </button>
                  </div>
                </div>
              )}
              {selected && (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      {selected.date === today && <span style={{ background: C.orange, color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 99 }}>오늘</span>}
                      <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>{fmtDate(selected.date)}</span>
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 900, color: C.txt }}>{selected.marketing_idea?.title}</div>
                  </div>
                  <IdeaDetail idea={selected} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
