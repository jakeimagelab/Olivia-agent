"use client";

import { useState, useRef } from "react";
import PageHeader from "@/components/PageHeader";
import {
  FileText, Instagram, MapPin, Sparkles,
  Copy, Check, RefreshCw, ChevronDown, ChevronUp
} from "lucide-react";

// ── 색상 ──────────────────────────────────────────────────
const C = {
  teal: "#155855", orange: "#E85D2C", yellow: "#EB8F22",
  sage: "#569082", bg: "#F0F9F8", white: "#ffffff",
  border: "rgba(21,88,85,.12)", muted: "#5A7470", light: "#EAF4F2",
};

// ── SNS 탭 메뉴 ───────────────────────────────────────────
const TABS = [
  { id: "blog",    label: "블로그 포스팅", icon: FileText,   status: "active",  badge: "" },
  { id: "insta",   label: "인스타그램",    icon: Instagram,  status: "coming",  badge: "준비중" },
  { id: "place",   label: "네이버 플레이스", icon: MapPin,   status: "coming",  badge: "준비중" },
] as const;

type TabId = typeof TABS[number]["id"];

// ── 블로그 폼 ─────────────────────────────────────────────
const DEPARTMENTS = ["피부과", "성형외과", "치과", "안과", "정형외과", "신경외과", "마취통증의학과", "한방병원·한의원", "검진내과", "산부인과", "정신건강의학과", "병원급"];
const TONES = ["전문적·신뢰감", "따뜻하고 친근함", "세련되고 감각적", "편안하고 부드러움", "활기차고 밝음"];
const PLATFORMS = [
  { value: "naver",   label: "네이버 블로그", desc: "검색 상위노출 최적화" },
  { value: "tistory", label: "티스토리",      desc: "SEO 구조 최적화" },
  { value: "kakao",   label: "카카오 채널",   desc: "짧고 임팩트 있게" },
];
const TOPICS = [
  "병원 리뉴얼 소개", "원장 프로필 소개", "병원 공간 소개",
  "진료과 소개", "촬영 비하인드", "시즌 이벤트", "의료진 인터뷰", "직접 입력",
];

type BlogForm = {
  hospitalName: string; department: string; topic: string; customTopic: string;
  keywords: string; tone: string; platform: string;
  photoDescription: string; additionalInfo: string;
};

type BlogResult = {
  title: string; content: string; hashtags: string[];
  seoKeywords: string[]; metaDescription: string; tips: string[];
};

// ── 마크다운 렌더러 (간단) ────────────────────────────────
function MarkdownView({ content }: { content: string }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.85, color: "#374151" }}>
      {content.split("\n").map((line, i) => {
        if (line.startsWith("## ")) return <h3 key={i} style={{ fontSize: 16, fontWeight: 900, color: C.teal, margin: "20px 0 8px" }}>{line.slice(3)}</h3>;
        if (line.startsWith("# "))  return <h2 key={i} style={{ fontSize: 18, fontWeight: 900, color: C.teal, margin: "24px 0 10px" }}>{line.slice(2)}</h2>;
        if (line.startsWith("- "))  return <div key={i} style={{ paddingLeft: 16, marginBottom: 4 }}>• {line.slice(2)}</div>;
        if (line.trim() === "")     return <div key={i} style={{ height: 10 }} />;
        return <p key={i} style={{ margin: "0 0 6px" }}>{line}</p>;
      })}
    </div>
  );
}

// ── 복사 버튼 ─────────────────────────────────────────────
function CopyBtn({ text, label = "복사" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.border}`,
      background: copied ? C.light : C.white, color: copied ? C.teal : C.muted,
      fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
      transition: "all 150ms",
    }}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "복사됨!" : label}
    </button>
  );
}

// ── 블로그 탭 컨텐츠 ──────────────────────────────────────
function BlogTab() {
  const [form, setForm] = useState<BlogForm>({
    hospitalName: "", department: "", topic: "", customTopic: "",
    keywords: "", tone: "", platform: "naver",
    photoDescription: "", additionalInfo: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<BlogResult | null>(null);
  const [error, setError]     = useState("");
  const [showTips, setShowTips] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const set = (k: keyof BlogForm, v: string) => setForm(p => ({ ...p, [k]: v }));

  const canGenerate = !!(form.hospitalName && form.department && (form.topic || form.customTopic) && form.keywords && form.tone);

  const generate = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/sns/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          topic: form.topic === "직접 입력" ? form.customTopic : form.topic,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "생성 실패");
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fullText = result ? `${result.title}\n\n${result.content}\n\n${result.hashtags.map(h => `#${h}`).join(" ")}` : "";

  return (
    <div style={{ display: "grid", gridTemplateColumns: result ? "1fr 1fr" : "1fr", gap: 24 }}>
      {/* ── 왼쪽: 입력 폼 ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* 병원 기본정보 */}
        <div style={{ background: C.white, borderRadius: 14, padding: "20px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 14 }}>📋 병원 기본 정보</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>병원명 *</label>
              <input value={form.hospitalName} onChange={e => set("hospitalName", e.target.value)}
                placeholder="예: 참이지치과"
                style={{ width: "100%", height: 42, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>진료과 *</label>
              <select value={form.department} onChange={e => set("department", e.target.value)}
                style={{ width: "100%", height: 42, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", fontSize: 13, fontFamily: "inherit", outline: "none", background: C.white, boxSizing: "border-box" }}>
                <option value="">선택</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 포스팅 주제 */}
        <div style={{ background: C.white, borderRadius: 14, padding: "20px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 14 }}>✏️ 포스팅 주제</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
            {TOPICS.map(t => (
              <button key={t} onClick={() => set("topic", t)} style={{
                padding: "6px 12px", borderRadius: 99, fontSize: 12, fontFamily: "inherit",
                border: `1.5px solid ${form.topic === t ? C.teal : C.border}`,
                background: form.topic === t ? C.light : C.white,
                color: form.topic === t ? C.teal : C.muted,
                fontWeight: form.topic === t ? 800 : 400, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>
          {form.topic === "직접 입력" && (
            <input value={form.customTopic} onChange={e => set("customTopic", e.target.value)}
              placeholder="주제를 직접 입력해주세요"
              style={{ width: "100%", height: 42, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
          )}
        </div>

        {/* SEO 키워드 + 톤 */}
        <div style={{ background: C.white, borderRadius: 14, padding: "20px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 14 }}>🔑 키워드 & 톤</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>핵심 키워드 * <span style={{ fontWeight: 400 }}>(쉼표로 구분)</span></label>
              <input value={form.keywords} onChange={e => set("keywords", e.target.value)}
                placeholder="예: 강남치과, 치아교정, 투명교정"
                style={{ width: "100%", height: 42, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>톤앤매너 *</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TONES.map(t => (
                  <button key={t} onClick={() => set("tone", t)} style={{
                    padding: "6px 12px", borderRadius: 99, fontSize: 12, fontFamily: "inherit",
                    border: `1.5px solid ${form.tone === t ? C.orange : C.border}`,
                    background: form.tone === t ? "#FFF0EB" : C.white,
                    color: form.tone === t ? C.orange : C.muted,
                    fontWeight: form.tone === t ? 800 : 400, cursor: "pointer",
                  }}>{t}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 플랫폼 */}
        <div style={{ background: C.white, borderRadius: 14, padding: "20px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 14 }}>📱 발행 플랫폼</div>
          <div style={{ display: "flex", gap: 8 }}>
            {PLATFORMS.map(p => (
              <button key={p.value} onClick={() => set("platform", p.value)} style={{
                flex: 1, padding: "10px 8px", borderRadius: 10, fontFamily: "inherit",
                border: `2px solid ${form.platform === p.value ? C.teal : C.border}`,
                background: form.platform === p.value ? C.light : C.white,
                cursor: "pointer", textAlign: "center",
              }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: form.platform === p.value ? C.teal : "#374151" }}>{p.label}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 사진 설명 (선택) */}
        <div style={{ background: C.white, borderRadius: 14, padding: "20px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 4 }}>📷 사진 설명 <span style={{ fontSize: 11, fontWeight: 400, color: C.muted }}>(선택)</span></div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>포토클리닉에서 촬영한 사진의 장면이나 분위기를 설명해주세요</div>
          <textarea value={form.photoDescription} onChange={e => set("photoDescription", e.target.value)}
            placeholder="예: 원장님 흰 가운 착용, 진료실에서 환자와 상담하는 자연스러운 장면. 따뜻한 조명, 모던한 인테리어..."
            rows={3}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
        </div>

        {/* 생성 버튼 */}
        <button onClick={generate} disabled={!canGenerate || loading} style={{
          width: "100%", height: 52, borderRadius: 12, border: "none",
          background: canGenerate && !loading ? `linear-gradient(135deg, ${C.teal}, #1e7870)` : "#E5E7EB",
          color: canGenerate && !loading ? "#fff" : "#9ca3af",
          fontSize: 16, fontWeight: 900, cursor: canGenerate && !loading ? "pointer" : "not-allowed",
          fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          boxShadow: canGenerate && !loading ? "0 4px 16px rgba(21,88,85,.25)" : "none",
          transition: "all 150ms",
        }}>
          {loading ? (
            <>
              <div style={{ width: 18, height: 18, border: "2.5px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
              블로그 포스팅 생성 중...
            </>
          ) : (
            <><Sparkles size={18} /> 블로그 포스팅 자동 생성</>
          )}
        </button>

        {error && (
          <div style={{ padding: "12px 16px", background: "#FFF0F0", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: "#DC2626" }}>
            ⚠ {error}
          </div>
        )}
      </div>

      {/* ── 오른쪽: 결과 ── */}
      {result && (
        <div ref={resultRef} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* 액션 버튼 */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CopyBtn text={fullText} label="전체 복사" />
            <CopyBtn text={result.title} label="제목만" />
            <CopyBtn text={result.hashtags.map(h => `#${h}`).join(" ")} label="해시태그" />
            <button onClick={generate} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.border}`,
              background: C.white, color: C.muted, fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              <RefreshCw size={13} /> 재생성
            </button>
          </div>

          {/* 제목 */}
          <div style={{ background: C.white, borderRadius: 14, padding: "18px 20px", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>블로그 제목</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#1C2B28", lineHeight: 1.4 }}>{result.title}</div>
          </div>

          {/* 메타 설명 */}
          <div style={{ background: "#F8F9FA", borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>🔍 검색 결과 설명</div>
            <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>{result.metaDescription}</div>
          </div>

          {/* 본문 */}
          <div style={{ background: C.white, borderRadius: 14, padding: "20px", border: `1px solid ${C.border}`, maxHeight: 500, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>📝 본문</div>
              <CopyBtn text={result.content} label="본문 복사" />
            </div>
            <MarkdownView content={result.content} />
          </div>

          {/* 해시태그 */}
          <div style={{ background: C.white, borderRadius: 14, padding: "16px 20px", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 10 }}>🏷️ 해시태그</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {result.hashtags.map((tag, i) => (
                <span key={i} style={{ background: C.light, color: C.teal, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 99 }}>
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* SEO 키워드 */}
          {result.seoKeywords?.length > 0 && (
            <div style={{ background: C.white, borderRadius: 14, padding: "16px 20px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 10 }}>🔑 SEO 키워드</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.seoKeywords.map((kw, i) => (
                  <span key={i} style={{ background: "#FFF8F5", border: `1px solid #FACCB8`, color: C.orange, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 99 }}>
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 작성 팁 */}
          {result.tips?.length > 0 && (
            <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <button onClick={() => setShowTips(p => !p)} style={{
                width: "100%", padding: "14px 20px", background: "none", border: "none",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                cursor: "pointer", fontFamily: "inherit",
              }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>💡 추가 작성 팁</span>
                {showTips ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
              </button>
              {showTips && (
                <div style={{ padding: "0 20px 16px", borderTop: `1px solid ${C.border}` }}>
                  {result.tips.map((tip, i) => (
                    <div key={i} style={{ fontSize: 13, color: "#374151", padding: "6px 0", borderBottom: i < result.tips.length-1 ? `1px solid #F3F4F6` : "none" }}>
                      · {tip}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Coming Soon 탭 ───────────────────────────────────────
function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: "#374151", marginBottom: 8 }}>{label} 준비 중</div>
      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        블로그 포스팅 기능 완성 후<br />순차적으로 업데이트될 예정이에요
      </div>
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────
export default function SnsManagerPage() {
  const [tab, setTab] = useState<TabId>("blog");

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <PageHeader title="SNS 콘텐츠 매니저" />

      {/* 탭 헤더 */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "0 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 4 }}>
          {TABS.map(({ id, label, icon: Icon, status, badge }) => (
            <button key={id} onClick={() => status === "active" && setTab(id)} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "14px 18px", border: "none", background: "none",
              borderBottom: tab === id ? `2.5px solid ${C.teal}` : "2.5px solid transparent",
              color: tab === id ? C.teal : status === "coming" ? "#C4C4C4" : C.muted,
              fontWeight: tab === id ? 900 : 500, fontSize: 14,
              cursor: status === "active" ? "pointer" : "default",
              fontFamily: "inherit", position: "relative",
            }}>
              <Icon size={16} />
              {label}
              {badge && (
                <span style={{ background: "#F3F4F6", color: "#9CA3AF", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 99, marginLeft: 2 }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 내용 */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 80px" }}>
        {tab === "blog"  && <BlogTab />}
        {tab === "insta" && <ComingSoon label="인스타그램 캡션 자동 생성" />}
        {tab === "place" && <ComingSoon label="네이버 플레이스 리뷰 답변" />}
      </div>
    </div>
  );
}
