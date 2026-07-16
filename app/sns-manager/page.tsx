"use client";

import { useState, useRef, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";
import {
  FileText, Instagram, MapPin, Sparkles, ShieldAlert, Calendar,
  Copy, Check, RefreshCw, ChevronDown, ChevronUp, AlertTriangle,
  Youtube, Image as ImageIcon,
} from "lucide-react";
import { C } from "@/lib/theme";
import { PageHeading } from "@/components/PageHeading";

const TABS = [
  { id: "insta",    label: "인스타그램",          icon: Instagram,    status: "active" },
  { id: "place",    label: "네이버 플레이스",      icon: MapPin,       status: "active" },
  { id: "blog",     label: "블로그",               icon: FileText,     status: "active" },
  { id: "youtube",  label: "유튜브 콘텐츠 기획",   icon: Youtube,      status: "active" },
  { id: "adcheck",  label: "의료광고 리스크 체크", icon: ShieldAlert,  status: "active" },
  { id: "calendar", label: "콘텐츠 캘린더",        icon: Calendar,     status: "coming" },
] as const;

type TabId = typeof TABS[number]["id"];

// ── 공통 스타일 ──────────────────────────────────────────────
const iS: React.CSSProperties = {
  width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8,
  padding: "0 12px", height: 42, fontSize: 13, fontFamily: "inherit",
  outline: "none", background: C.white, boxSizing: "border-box",
};
const taS: React.CSSProperties = { ...iS, height: "auto", padding: "10px 12px", resize: "vertical" };

// ── 복사 버튼 ────────────────────────────────────────────────
function CopyBtn({ text, label = "복사" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className={`pc-btn pc-btn--sm ${copied ? "pc-btn--primary" : "pc-btn--secondary"}`}>
      {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "복사됨!" : label}
    </button>
  );
}

// ── 마크다운 렌더러 ──────────────────────────────────────────
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

// ── 블로그 패턴 라이터 ───────────────────────────────────────
const DEPARTMENTS = ["피부과", "성형외과", "치과", "안과", "정형외과", "신경외과", "마취통증의학과", "한방병원·한의원", "검진내과", "산부인과", "정신건강의학과", "병원급"];

const BLOG_TYPES = [
  { id: "case",      label: "병원 촬영 사례형",    desc: "촬영 과정과 결과를 스토리로" },
  { id: "profile",   label: "원장 프로필 촬영형",  desc: "원장님 브랜딩과 신뢰 구축" },
  { id: "harmony",   label: "하모니컷",            desc: "포토클리닉 하모니컷 소개" },
  { id: "diagnosis", label: "병원 이미지 진단형",  desc: "브랜드 이미지 개선 제안" },
  { id: "review",    label: "촬영 후기형",         desc: "촬영 경험과 만족도 공유" },
  { id: "column",    label: "병원 브랜딩 칼럼형",  desc: "전문성 기반 마케팅 칼럼" },
];

type StyleProfile = {
  id: string; name: string; description: string; tone: string;
  titlePatterns: string; openingPatterns: string; bodyStructure: string;
  commonPhrases: string[]; photoclinicMessages: string[]; ctaPatterns: string;
  sourceCount: number; isDefault: boolean;
};
type SourcePost = {
  id: string; title: string; url: string; body: string; category: string;
  analysis?: { titlePattern: string; openingPattern: string; bodyStructure: string; commonPhrases: string[]; tone: string; keyMessages: string[]; ctaPattern: string };
};
type BlogGenResult = {
  titleCandidates: string[]; body: string; headings: string[];
  metaDescription: string; hashtags: string[]; seoKeywords: string[];
  instagramSummary: string; naverPlaceVersion: string; cta: string;
  riskCheck: { level: string; issues: {original:string;risk_type:string;reason:string;suggestion:string;level:string}[]; summary: string };
  tips: string[];
};
type BWForm = {
  hospitalName: string; department: string; blogType: string; topic: string;
  keywords: string; shootingDetails: string; hospitalFeatures: string;
  targetAudience: string; location: string; additionalInfo: string;
};

const DEFAULT_PROFILES: StyleProfile[] = [
  { id:"dp1", name:"포토클리닉 기본형", description:"신뢰감 있는 전문 톤으로 병원 브랜딩을 소개", tone:"전문적·신뢰감", titlePatterns:"[병원명] + 핵심 키워드 + 포토클리닉 촬영", openingPatterns:"병원의 첫인상은 사진부터 시작됩니다.", bodyStructure:"소개 → 촬영 배경 → 진행 과정 → 결과물 → CTA", commonPhrases:["병원 브랜딩","전문 촬영","이미지 메이킹","신뢰감"], photoclinicMessages:["포토클리닉만의 촬영 노하우","병원 이미지를 업그레이드"], ctaPatterns:"포토클리닉과 함께 병원 브랜딩을 시작해보세요.", sourceCount:0, isDefault:true },
  { id:"dp2", name:"감성 스토리형", description:"따뜻한 감성으로 병원과 환자의 이야기 전달", tone:"따뜻하고 친근함", titlePatterns:"스토리 중심 / 감성적 문장형 제목", openingPatterns:"한 병원의 특별한 변화가 시작됐습니다.", bodyStructure:"에피소드 → 변화의 계기 → 촬영 여정 → 완성된 이야기 → CTA", commonPhrases:["특별한 순간","진심을 담아","이야기가 있는","따뜻한"], photoclinicMessages:["당신의 이야기를 사진으로 담습니다"], ctaPatterns:"당신의 특별한 이야기, 포토클리닉이 담아드립니다.", sourceCount:0, isDefault:true },
  { id:"dp3", name:"정보 제공형", description:"유익한 정보와 팁으로 독자의 신뢰를 쌓는 방식", tone:"전문적이지만 쉽게 읽히는", titlePatterns:"숫자 포함 / '~하는 방법' / '~이란?' 형식", openingPatterns:"병원 마케팅에서 가장 중요한 것은 무엇일까요?", bodyStructure:"문제 제기 → 원인 분석 → 해결책 → 사례 → 팁 → CTA", commonPhrases:["실제 도움이 되는","알아두면 좋은","핵심 포인트"], photoclinicMessages:["병원 마케팅의 핵심 솔루션"], ctaPatterns:"지금 포토클리닉에서 상담을 시작해보세요.", sourceCount:0, isDefault:true },
  { id:"dp4", name:"프리미엄 브랜딩형", description:"고급스럽고 세련된 톤으로 프리미엄 이미지 강조", tone:"세련되고 감각적", titlePatterns:"브랜드 지향 / 간결하고 강한 제목", openingPatterns:"차별화된 병원 이미지의 시작.", bodyStructure:"비전 제시 → 브랜드 스토리 → 비주얼 전략 → CTA", commonPhrases:["프리미엄","차별화","아이덴티티","브랜드 가치"], photoclinicMessages:["프리미엄 의료 브랜딩 파트너"], ctaPatterns:"포토클리닉과 함께 프리미엄 브랜드를 완성하세요.", sourceCount:0, isDefault:true },
  { id:"dp5", name:"원장 중심형", description:"원장의 철학과 스토리로 신뢰를 구축하는 방식", tone:"진정성 있고 신뢰감 있는", titlePatterns:"원장명 포함 / 철학 중심 제목", openingPatterns:"환자를 위한 공간, 그 시작은 이미지입니다.", bodyStructure:"원장 소개 → 진료 철학 → 공간의 의미 → 촬영 과정 → CTA", commonPhrases:["진심","철학","경험","환자를 위한"], photoclinicMessages:["원장님의 진심을 이미지로"], ctaPatterns:"원장님의 진심을 포토클리닉이 전달해 드립니다.", sourceCount:0, isDefault:true },
  { id:"dp6", name:"SEO 최적화형", description:"검색 상위노출을 위한 키워드 중심 구조", tone:"명확하고 정보 중심적", titlePatterns:"지역 + 진료과 + 핵심 키워드 조합", openingPatterns:"강남 피부과 브랜딩 촬영을 찾고 계신다면", bodyStructure:"키워드 도입 → 정보 제공 → 세부 사항 → 위치 → CTA", commonPhrases:["강남","추천","후기","예약"], photoclinicMessages:["클릭되는 병원 브랜딩"], ctaPatterns:"지금 바로 포토클리닉에 문의주세요.", sourceCount:0, isDefault:true },
  { id:"dp7", name:"친근 에피소드형", description:"일상적인 에피소드로 공감을 이끌어내는 방식", tone:"편안하고 친근함", titlePatterns:"일상 에피소드 / 의문형 / 공감형 제목", openingPatterns:"솔직하게 말씀드릴게요.", bodyStructure:"공감 에피소드 → 문제 인식 → 해결 과정 → 변화 → CTA", commonPhrases:["솔직히","생각해보면","의외로","이렇게 하면"], photoclinicMessages:["부담 없이 시작하는 병원 브랜딩"], ctaPatterns:"부담 없이 포토클리닉에 먼저 연락해보세요!", sourceCount:0, isDefault:true },
];

const RISK_COLORS: Record<string,{bg:string;color:string;border:string}> = {
  "안전": { bg:"#F0FDF4", color:"#22876A", border:"#B2E2CF" },
  "주의": { bg:"#FFFBEB", color:"#B45309", border:"#FCD34D" },
  "위험": { bg:"#FFF5F5", color:"#DC2626", border:"#FECACA" },
};

function PatternBlogWriter() {
  const [step, setStep] = useState<"source"|"style"|"write"|"result">("style");
  const [sourcePosts, setSourcePosts] = useState<SourcePost[]>([]);
  const [srcForm, setSrcForm] = useState({ title:"", url:"", body:"", category:"병원 촬영 사례형" });
  const [analyzing, setAnalyzing] = useState<string|null>(null);
  const [srcMsg, setSrcMsg] = useState("");
  const [profiles, setProfiles] = useState<StyleProfile[]>(DEFAULT_PROFILES);
  const [selected, setSelected] = useState<StyleProfile>(DEFAULT_PROFILES[0]);
  const [viewProfile, setViewProfile] = useState<StyleProfile|null>(null);
  const [form, setForm] = useState<BWForm>({ hospitalName:"", department:"", blogType:"병원 촬영 사례형", topic:"", keywords:"", shootingDetails:"", hospitalFeatures:"", targetAudience:"", location:"", additionalInfo:"" });
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [result, setResult] = useState<BlogGenResult|null>(null);
  const [selTitle, setSelTitle] = useState(0);
  const [resultTab, setResultTab] = useState<"blog"|"insta"|"naver"|"risk">("blog");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const sp = localStorage.getItem("blog_source_posts");
      if (sp) setSourcePosts(JSON.parse(sp));
      const cp = localStorage.getItem("blog_custom_profiles");
      if (cp) setProfiles([...DEFAULT_PROFILES, ...JSON.parse(cp)]);
    } catch {}
  }, []);

  const saveSourcePosts = (posts: SourcePost[]) => {
    setSourcePosts(posts);
    localStorage.setItem("blog_source_posts", JSON.stringify(posts));
  };

  const addSourcePost = () => {
    if (!srcForm.title.trim() || !srcForm.body.trim()) { setSrcMsg("제목과 본문을 입력해주세요."); return; }
    const post: SourcePost = { id: Date.now().toString(), ...srcForm };
    saveSourcePosts([...sourcePosts, post]);
    setSrcForm({ title:"", url:"", body:"", category:"병원 촬영 사례형" });
    setSrcMsg("소스 글이 추가됐습니다.");
  };

  const analyzePost = async (post: SourcePost) => {
    setAnalyzing(post.id); setSrcMsg("");
    try {
      const res = await fetch("/api/blog/analyze-source", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ title: post.title, body: post.body, category: post.category }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "분석 실패");
      const updated = sourcePosts.map(p => p.id === post.id ? { ...p, analysis: data } : p);
      saveSourcePosts(updated);
      setSrcMsg("패턴 분석이 완료됐습니다!");
    } catch (e: any) { setSrcMsg("분석 실패: " + e.message); }
    finally { setAnalyzing(null); }
  };

  const buildProfileFromAnalyzed = () => {
    const analyzed = sourcePosts.filter(p => p.analysis);
    if (!analyzed.length) { setSrcMsg("먼저 소스 글을 분석해주세요."); return; }
    const phrases = Array.from(new Set(analyzed.flatMap(p => p.analysis!.commonPhrases || []))).slice(0, 6);
    const keys = Array.from(new Set(analyzed.flatMap(p => p.analysis!.keyMessages || []))).slice(0, 4);
    const newProfile: StyleProfile = {
      id: `custom-${Date.now()}`,
      name: `커스텀 프로필 ${profiles.filter(p => !p.isDefault).length + 1}`,
      description: `${analyzed.length}개 소스 글에서 추출한 패턴`,
      tone: analyzed[0].analysis!.tone || "자연스러운",
      titlePatterns: analyzed.map(p => p.analysis!.titlePattern).join(" / "),
      openingPatterns: analyzed.map(p => p.analysis!.openingPattern).join(" / "),
      bodyStructure: analyzed[0].analysis!.bodyStructure || "",
      commonPhrases: phrases,
      photoclinicMessages: keys,
      ctaPatterns: analyzed.map(p => p.analysis!.ctaPattern).filter(Boolean).join(" / "),
      sourceCount: analyzed.length,
      isDefault: false,
    };
    const customs = profiles.filter(p => !p.isDefault);
    const updated = [...DEFAULT_PROFILES, ...customs, newProfile];
    setProfiles(updated);
    localStorage.setItem("blog_custom_profiles", JSON.stringify([...customs, newProfile]));
    setSrcMsg("커스텀 스타일 프로필이 생성됐습니다! '스타일 선택' 탭에서 확인하세요.");
  };

  const generate = async () => {
    if (!form.hospitalName || !form.topic) { setGenError("병원명과 주제는 필수입니다."); return; }
    setGenerating(true); setGenError(""); setResult(null);
    try {
      const res = await fetch("/api/blog/generate", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ styleProfile: selected, ...form }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "생성 실패");
      setResult(data); setSelTitle(0); setResultTab("blog");
      setStep("result");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior:"smooth" }), 100);
    } catch (e: any) { setGenError(e.message); }
    finally { setGenerating(false); }
  };

  const savePost = async () => {
    if (!result) return;
    setSaving(true); setSaveMsg("");
    try {
      const res = await fetch("/api/blog/save", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ blogType: form.blogType, title: result.titleCandidates[selTitle], body: result.body, metaDescription: result.metaDescription, hashtags: result.hashtags, seoKeywords: result.seoKeywords, instagramSummary: result.instagramSummary, naverPlaceVersion: result.naverPlaceVersion, cta: result.cta, riskCheckResult: result.riskCheck, status:"draft" }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSaveMsg("저장됐습니다!");
    } catch (e: any) { setSaveMsg("저장 실패: " + e.message); }
    finally { setSaving(false); }
  };

  useSaveShortcut(savePost);

  const sI: React.CSSProperties = { ...iS };
  const sTA: React.CSSProperties = { ...taS };

  const STEP_LIST = [
    { id:"source", label:"1. 소스 글" },
    { id:"style",  label:"2. 스타일 선택" },
    { id:"write",  label:"3. 글 작성" },
    { id:"result", label:"4. 결과" },
  ] as const;

  const riskStyle = RISK_COLORS[result?.riskCheck?.level || "안전"] || RISK_COLORS["안전"];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {/* Stepper */}
      <div style={{ display:"flex", gap:0, background:C.white, borderRadius:12, border:`1px solid ${C.border}`, overflow:"hidden" }}>
        {STEP_LIST.map((s, i) => (
          <button key={s.id} onClick={() => setStep(s.id as any)}
            style={{ flex:1, padding:"12px 8px", border:"none", borderRight: i < 3 ? `1px solid ${C.border}` : "none", background: step === s.id ? C.teal : "transparent", color: step === s.id ? "#fff" : C.muted, fontSize:12, fontWeight: step === s.id ? 900 : 600, cursor:"pointer", fontFamily:"inherit", transition:"all 150ms" }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Step 1: 소스 글 관리 ── */}
      {step === "source" && (
        <div className="pc-mobile-stack" style={{ display:"grid", gridTemplateColumns:"400px 1fr", gap:20, alignItems:"start" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:13, fontWeight:900, color:C.teal, marginBottom:4 }}>📄 기존 블로그 글 추가</div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>포토클리닉 스타일로 작성된 기존 블로그 글을 추가하면 패턴을 학습해 커스텀 스타일 프로필을 만들 수 있습니다.</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>글 제목 *</label><input value={srcForm.title} onChange={e => setSrcForm(p=>({...p, title:e.target.value}))} placeholder="블로그 글 제목을 입력하세요" style={sI} /></div>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>URL (선택)</label><input value={srcForm.url} onChange={e => setSrcForm(p=>({...p, url:e.target.value}))} placeholder="https://blog.naver.com/..." style={sI} /></div>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>글 유형</label>
                  <select value={srcForm.category} onChange={e => setSrcForm(p=>({...p, category:e.target.value}))} style={sI}>
                    {BLOG_TYPES.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
                  </select>
                </div>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>본문 내용 * <span style={{fontWeight:400}}>(복사해서 붙여넣기)</span></label><textarea value={srcForm.body} onChange={e => setSrcForm(p=>({...p, body:e.target.value}))} rows={8} placeholder="블로그 본문을 붙여넣으세요..." style={sTA} /></div>
              </div>
              <button onClick={addSourcePost} className="pc-btn pc-btn--primary" style={{ width:"100%", marginTop:14 }}>소스 글 추가</button>
              {srcMsg && <div style={{ marginTop:8, fontSize:12, color: srcMsg.includes("실패")||srcMsg.includes("입력") ? C.orange : C.teal, fontWeight:700 }}>{srcMsg}</div>}
            </div>
            <button onClick={buildProfileFromAnalyzed} className="pc-btn pc-btn--secondary">
              ✨ 분석된 글로 커스텀 프로필 생성
            </button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:13, fontWeight:900, color:C.teal }}>저장된 소스 글 ({sourcePosts.length}개)</div>
            {!sourcePosts.length && <div style={{ color:C.muted, fontSize:13, padding:"20px 0" }}>추가된 소스 글이 없습니다.</div>}
            {sourcePosts.map(post => (
              <div key={post.id} style={{ background:C.white, borderRadius:14, padding:18, border:`1px solid ${post.analysis ? C.teal : C.border}`, borderLeftWidth: post.analysis ? 4 : 1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start", gap:10, marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:"#1C2B28" }}>{post.title}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{post.category} {post.url && <a href={post.url} target="_blank" rel="noreferrer" style={{color:C.teal}}>링크 ↗</a>}</div>
                  </div>
                  <button onClick={() => analyzePost(post)} disabled={analyzing === post.id} className={`pc-btn pc-btn--sm ${post.analysis ? "pc-btn--secondary" : "pc-btn--orange"}`} style={{ whiteSpace:"nowrap" }}>
                    {analyzing === post.id ? "분석 중..." : post.analysis ? "재분석" : "패턴 분석"}
                  </button>
                </div>
                {post.analysis && (
                  <div style={{ background:"#F8FFFE", borderRadius:10, padding:12, display:"grid", gap:6 }}>
                    <div style={{ fontSize:11, color:C.muted }}><strong style={{color:C.teal}}>톤:</strong> {post.analysis.tone}</div>
                    <div style={{ fontSize:11, color:C.muted }}><strong style={{color:C.teal}}>제목 패턴:</strong> {post.analysis.titlePattern}</div>
                    <div style={{ fontSize:11, color:C.muted }}><strong style={{color:C.teal}}>도입 패턴:</strong> {post.analysis.openingPattern}</div>
                    <div style={{ fontSize:11, color:C.muted }}><strong style={{color:C.teal}}>자주 쓰는 표현:</strong> {post.analysis.commonPhrases?.join(", ")}</div>
                  </div>
                )}
                <div style={{ fontSize:12, color:C.muted, marginTop:8, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{post.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: 스타일 프로필 선택 ── */}
      {step === "style" && (
        <div style={{ display:"grid", gridTemplateColumns: viewProfile ? "1fr 380px" : "1fr", gap:20 }}>
          <div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:16 }}>블로그 글의 톤앤매너와 구조를 결정하는 스타일 프로필을 선택하세요. 소스 글 분석으로 커스텀 프로필을 만들 수도 있습니다.</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:12 }}>
              {profiles.map(p => (
                <div key={p.id} onClick={() => setSelected(p)}
                  style={{ background:C.white, borderRadius:14, padding:18, border:`2px solid ${selected.id === p.id ? C.teal : C.border}`, cursor:"pointer", transition:"all 150ms", position:"relative" }}>
                  {!p.isDefault && <span style={{ position:"absolute", top:12, right:12, background:C.orange, color:"#fff", fontSize:11, fontWeight:800, padding:"2px 7px", borderRadius:99 }}>커스텀</span>}
                  {selected.id === p.id && <span style={{ position:"absolute", top:12, right:p.isDefault ? 12 : 60, fontSize:14 }}>✓</span>}
                  <div style={{ fontSize:14, fontWeight:900, color:C.teal, marginBottom:4 }}>{p.name}</div>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:10, lineHeight:1.5 }}>{p.description}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <span style={{ background:C.light, color:C.teal, fontSize:11, fontWeight:700, padding:"3px 8px", borderRadius:99 }}>{p.tone}</span>
                    {!p.isDefault && p.sourceCount > 0 && <span style={{ background:"#FFF0EB", color:C.orange, fontSize:11, fontWeight:700, padding:"3px 8px", borderRadius:99 }}>소스 {p.sourceCount}개</span>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); setViewProfile(viewProfile?.id === p.id ? null : p); }}
                    className="pc-btn pc-btn--ghost pc-btn--sm" style={{ marginTop:10, width:"100%" }}>
                    {viewProfile?.id === p.id ? "닫기" : "상세 보기"}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop:16, display:"flex", gap:10 }}>
              <button onClick={() => setStep("write")} className="pc-btn pc-btn--primary pc-btn--lg" style={{ flex:1 }}>
                "{selected.name}" 스타일로 글 쓰기 →
              </button>
              <button onClick={() => setStep("source")} className="pc-btn pc-btn--secondary pc-btn--lg">
                소스 글 관리
              </button>
            </div>
          </div>
          {viewProfile && (
            <div style={{ background:C.white, borderRadius:16, padding:20, border:`1px solid ${C.border}`, position:"sticky", top:18 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ fontSize:15, fontWeight:900, color:C.teal }}>{viewProfile.name}</div>
                <button onClick={() => setViewProfile(null)} style={{ border:"none", background:"none", color:C.muted, fontSize:18, cursor:"pointer", lineHeight:1 }}>×</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {[
                  { label:"톤앤매너", value: viewProfile.tone },
                  { label:"제목 패턴", value: viewProfile.titlePatterns },
                  { label:"도입부 패턴", value: viewProfile.openingPatterns },
                  { label:"본문 구조", value: viewProfile.bodyStructure },
                  { label:"CTA 패턴", value: viewProfile.ctaPatterns },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize:11, fontWeight:800, color:C.muted, marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:12, color:"#374141", lineHeight:1.6, background:"#F8FAFA", borderRadius:8, padding:"8px 12px" }}>{value}</div>
                  </div>
                ))}
                {viewProfile.commonPhrases?.length > 0 && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:C.muted, marginBottom:6 }}>자주 쓰는 표현</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>{viewProfile.commonPhrases.map((ph,i) => <span key={i} style={{ background:C.light, color:C.teal, fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:99 }}>{ph}</span>)}</div>
                  </div>
                )}
                {viewProfile.photoclinicMessages?.length > 0 && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:C.muted, marginBottom:6 }}>포토클리닉 핵심 메시지</div>
                    {viewProfile.photoclinicMessages.map((m,i) => <div key={i} style={{ fontSize:12, color:C.orange, fontWeight:700 }}>· {m}</div>)}
                  </div>
                )}
              </div>
              <button onClick={() => { setSelected(viewProfile); setStep("write"); }} className="pc-btn pc-btn--primary" style={{ width:"100%", marginTop:16 }}>
                이 스타일로 작성하기
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: 글 작성 ── */}
      {step === "write" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 360px", gap:24, alignItems:"start" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* 선택된 스타일 표시 */}
            <div style={{ background:C.light, borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:13, color:C.teal }}><span style={{fontWeight:400}}>선택된 스타일:</span> <strong>{selected.name}</strong> — {selected.tone}</div>
              <button onClick={() => setStep("style")} className="pc-btn pc-btn--ghost pc-btn--sm">변경</button>
            </div>

            {/* 클라이언트 정보 */}
            <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:13, fontWeight:900, color:C.teal, marginBottom:14 }}>🏥 클라이언트 정보</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>병원명 *</label><input value={form.hospitalName} onChange={e => setForm(p=>({...p,hospitalName:e.target.value}))} placeholder="예: 포토클리닉" style={sI} /></div>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>진료과</label><select value={form.department} onChange={e => setForm(p=>({...p,department:e.target.value}))} style={sI}><option value="">선택</option>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>지역</label><input value={form.location} onChange={e => setForm(p=>({...p,location:e.target.value}))} placeholder="예: 강남구" style={sI} /></div>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>타겟 독자</label><input value={form.targetAudience} onChange={e => setForm(p=>({...p,targetAudience:e.target.value}))} placeholder="예: 30-40대 여성" style={sI} /></div>
              </div>
            </div>

            {/* 블로그 타입 */}
            <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:13, fontWeight:900, color:C.teal, marginBottom:14 }}>📋 블로그 타입</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8 }}>
                {BLOG_TYPES.map(t => (
                  <button key={t.id} onClick={() => setForm(p=>({...p,blogType:t.label}))}
                    style={{ padding:"10px 8px", borderRadius:10, fontFamily:"inherit", border:`2px solid ${form.blogType === t.label ? C.teal : C.border}`, background: form.blogType === t.label ? C.light : C.white, cursor:"pointer", textAlign:"center" }}>
                    <div style={{ fontSize:12, fontWeight:900, color: form.blogType === t.label ? C.teal : "#374141", marginBottom:2 }}>{t.label}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 콘텐츠 내용 */}
            <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:13, fontWeight:900, color:C.teal, marginBottom:14 }}>✏️ 콘텐츠 내용</div>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>주제 / 제목 방향 *</label><input value={form.topic} onChange={e => setForm(p=>({...p,topic:e.target.value}))} placeholder="예: 강남 성형외과 촬영 후 달라진 SNS 반응" style={sI} /></div>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>핵심 키워드 <span style={{fontWeight:400}}>(쉼표로 구분)</span></label><input value={form.keywords} onChange={e => setForm(p=>({...p,keywords:e.target.value}))} placeholder="예: 강남성형외과, 병원브랜딩, 포토클리닉" style={sI} /></div>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>촬영 내용 / 진행 상황</label><textarea value={form.shootingDetails} onChange={e => setForm(p=>({...p,shootingDetails:e.target.value}))} rows={3} placeholder="어떤 공간을 촬영했는지, 어떤 장비나 스타일링이 있었는지..." style={sTA} /></div>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>병원 특징 / 강점</label><textarea value={form.hospitalFeatures} onChange={e => setForm(p=>({...p,hospitalFeatures:e.target.value}))} rows={2} placeholder="병원의 차별화된 특징, 의료진, 시설 등..." style={sTA} /></div>
                <div><label style={{ fontSize:12, fontWeight:700, color:C.muted, display:"block", marginBottom:4 }}>추가 정보</label><textarea value={form.additionalInfo} onChange={e => setForm(p=>({...p,additionalInfo:e.target.value}))} rows={2} placeholder="꼭 포함해야 할 내용이나 특별 요청사항..." style={sTA} /></div>
              </div>
            </div>

            {genError && <div style={{ padding:"12px 16px", background:"#FFF0F0", border:"1px solid #FECACA", borderRadius:10, fontSize:13, color:"#DC2626" }}>⚠ {genError}</div>}
            <button onClick={generate} disabled={generating} className="pc-btn pc-btn--primary pc-btn--lg" style={{ height:54 }}>
              {generating ? <><div style={{width:18,height:18,border:"2.5px solid rgba(255,255,255,.4)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite"}} />AI 블로그 생성 중...</> : <><Sparkles size={18} />포토클리닉 블로그 패턴 생성</>}
            </button>
          </div>

          {/* 우측 미리보기 패널 */}
          <div style={{ position:"sticky", top:18, display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ background:C.white, borderRadius:14, padding:18, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:12, fontWeight:900, color:C.teal, marginBottom:12 }}>💡 선택된 스타일 가이드</div>
              <div style={{ fontSize:11, color:C.muted, lineHeight:1.7, display:"flex", flexDirection:"column", gap:8 }}>
                <div><strong style={{color:"#374141"}}>제목 패턴</strong><br/>{selected.titlePatterns}</div>
                <div><strong style={{color:"#374141"}}>도입부</strong><br/>{selected.openingPatterns}</div>
                <div><strong style={{color:"#374141"}}>구조</strong><br/>{selected.bodyStructure}</div>
              </div>
            </div>
            <div style={{ background:C.white, borderRadius:14, padding:18, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:12, fontWeight:900, color:C.teal, marginBottom:10 }}>✅ 생성 항목</div>
              {["제목 후보 3개","본문 (2000자 이상, 마크다운)","소제목 목록","해시태그·SEO 키워드","인스타그램 캡션 변환","네이버 플레이스 변환","의료광고 리스크 체크"].map((item,i) => (
                <div key={i} style={{ fontSize:11, color:C.muted, padding:"3px 0" }}>· {item}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: 결과 ── */}
      {step === "result" && result && (
        <div ref={resultRef} style={{ display:"flex", flexDirection:"column", gap:18 }}>
          {/* 상단 액션 바 */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            <button onClick={() => setStep("write")} className="pc-btn pc-btn--secondary pc-btn--sm">← 다시 작성</button>
            <button onClick={generate} className="pc-btn pc-btn--secondary pc-btn--sm"><RefreshCw size={13} />재생성</button>
            <button onClick={savePost} disabled={saving} className="pc-btn pc-btn--ghost pc-btn--sm">
              {saving ? "저장 중..." : "💾 초안 저장"}
            </button>
            {saveMsg && <span style={{ fontSize:12, color: saveMsg.includes("실패") ? C.orange : C.teal, fontWeight:700 }}>{saveMsg}</span>}
          </div>

          <div className="pc-inline-tabs" style={{ display:"flex", gap:6 }}>
            {(["blog","insta","naver","risk"] as const).map(t => (
              <button key={t} onClick={() => setResultTab(t)} style={{ padding:"6px 12px", borderRadius:8, border:`1.5px solid ${resultTab === t ? C.teal : C.border}`, background: resultTab === t ? C.light : C.white, color: resultTab === t ? C.teal : C.muted, fontSize:12, fontWeight: resultTab === t ? 800 : 600, cursor:"pointer", fontFamily:"inherit" }}>
                {t === "blog" ? "📝 블로그" : t === "insta" ? "📷 인스타" : t === "naver" ? "🗺 네이버" : "🛡 리스크"}
              </button>
            ))}
          </div>

          {/* 제목 후보 */}
          <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:900, color:C.teal }}>📌 제목 후보 (클릭해서 선택)</div>
              <CopyBtn text={result.titleCandidates[selTitle] || ""} label="선택 제목 복사" />
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {result.titleCandidates.map((t, i) => (
                <button key={i} onClick={() => setSelTitle(i)} style={{ textAlign:"left", padding:"11px 14px", borderRadius:10, border:`2px solid ${selTitle === i ? C.teal : C.border}`, background: selTitle === i ? C.light : "#FAFAFA", color: selTitle === i ? C.teal : "#374141", fontWeight: selTitle === i ? 800 : 400, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
                  {i === 0 ? "⭐ " : `${i+1}. `}{t}
                </button>
              ))}
            </div>
          </div>

          {/* 탭 콘텐츠 */}
          {resultTab === "blog" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}`, maxHeight:600, overflowY:"auto" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}><div style={{ fontSize:13, fontWeight:900, color:C.teal }}>📝 본문</div><CopyBtn text={result.body} label="본문 복사" /></div>
                <MarkdownView content={result.body} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div style={{ background:C.white, borderRadius:14, padding:18, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:12, fontWeight:900, color:C.teal, marginBottom:8 }}>🏷️ 해시태그</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>{result.hashtags.map((t,i) => <span key={i} style={{ background:C.light, color:C.teal, fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:99 }}>#{t}</span>)}</div>
                  <div style={{ marginTop:8 }}><CopyBtn text={result.hashtags.map(h=>`#${h}`).join(" ")} label="복사" /></div>
                </div>
                <div style={{ background:C.white, borderRadius:14, padding:18, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:12, fontWeight:900, color:C.teal, marginBottom:8 }}>🔍 SEO 키워드</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>{result.seoKeywords.map((k,i) => <span key={i} style={{ background:"#F3F4F6", color:"#374141", fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:99 }}>{k}</span>)}</div>
                </div>
              </div>
              {result.metaDescription && (
                <div style={{ background:C.white, borderRadius:14, padding:18, border:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}><div style={{ fontSize:12, fontWeight:900, color:C.teal }}>🌐 메타 설명 (SEO)</div><CopyBtn text={result.metaDescription} /></div>
                  <div style={{ fontSize:13, color:"#374141", lineHeight:1.6, background:"#FAFAFA", borderRadius:8, padding:"10px 12px" }}>{result.metaDescription}</div>
                </div>
              )}
              {result.tips?.length > 0 && (
                <div style={{ background:C.white, borderRadius:14, padding:18, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:12, fontWeight:900, color:C.teal, marginBottom:8 }}>💡 작성 팁</div>
                  {result.tips.map((tip,i) => <div key={i} style={{ fontSize:12, color:C.muted, padding:"4px 0" }}>· {tip}</div>)}
                </div>
              )}
            </div>
          )}

          {resultTab === "insta" && (
            <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:900, color:C.teal }}>📷 인스타그램 캡션</div>
                <CopyBtn text={result.instagramSummary} label="캡션 복사" />
              </div>
              <div style={{ fontSize:14, lineHeight:1.9, color:"#374141", whiteSpace:"pre-wrap", background:"#FAFAFA", borderRadius:10, padding:"16px 18px" }}>{result.instagramSummary}</div>
              <div style={{ marginTop:12, fontSize:11, color:C.muted }}>글자 수: {result.instagramSummary.length}자</div>
            </div>
          )}

          {resultTab === "naver" && (
            <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:900, color:C.teal }}>🗺 네이버 플레이스 소식글</div>
                <CopyBtn text={result.naverPlaceVersion} label="소식글 복사" />
              </div>
              <div style={{ fontSize:14, lineHeight:1.9, color:"#374141", whiteSpace:"pre-wrap", background:"#FAFAFA", borderRadius:10, padding:"16px 18px" }}>{result.naverPlaceVersion}</div>
              <div style={{ marginTop:12, fontSize:11, color:C.muted }}>글자 수: {result.naverPlaceVersion.length}자</div>
            </div>
          )}

          {resultTab === "risk" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ background: riskStyle.bg, border:`2px solid ${riskStyle.border}`, borderRadius:14, padding:"18px 20px" }}>
                <div style={{ fontSize:18, fontWeight:900, color:riskStyle.color, marginBottom:6 }}>
                  {result.riskCheck.level === "안전" ? "✅" : result.riskCheck.level === "주의" ? "⚠️" : "🚨"} 의료광고 리스크: {result.riskCheck.level}
                </div>
                <div style={{ fontSize:13, color:"#374141", lineHeight:1.7 }}>{result.riskCheck.summary}</div>
              </div>
              {result.riskCheck.issues?.length > 0 ? (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ fontSize:12, fontWeight:900, color:C.orange }}>⚠ 발견된 문제 ({result.riskCheck.issues.length}건)</div>
                  {result.riskCheck.issues.map((issue, i) => {
                    const lv = RISK_COLORS[issue.level] || RISK_COLORS["주의"];
                    return (
                      <div key={i} style={{ background:lv.bg, border:`1px solid ${lv.border}`, borderRadius:12, padding:16 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#1C2B28", marginBottom:6, background:"#fff8", borderRadius:6, padding:"6px 10px" }}>원문: "{issue.original}"</div>
                        <div style={{ fontSize:12, color:"#374141", marginBottom:8 }}><strong>사유:</strong> {issue.reason}</div>
                        <div style={{ background:"#fff", borderRadius:8, padding:"10px 12px", border:`1px solid ${lv.border}`, fontSize:12, color:"#374141" }}>
                          <strong style={{color:"#22876A"}}>✏ 수정 제안:</strong> {issue.suggestion}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ background:"#F0FDF4", borderRadius:12, padding:16, color:"#22876A", fontSize:13, fontWeight:700 }}>✅ 의료광고법 위반 표현이 발견되지 않았습니다.</div>
              )}
            </div>
          )}
        </div>
      )}

      {step === "result" && !result && (
        <div style={{ textAlign:"center", padding:"60px 20px", color:C.muted }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📝</div>
          <div style={{ fontSize:16, fontWeight:700 }}>아직 생성된 결과가 없습니다.</div>
          <button onClick={() => setStep("write")} className="pc-btn pc-btn--primary" style={{ marginTop:16 }}>글 작성하러 가기</button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── 인스타그램 탭 ───────────────────────────────────────────
const INSTA_FORMATS = [
  "피드 1장", "카드뉴스", "릴스 썸네일", "릴스 캡션", "스토리", "비포/애프터", "의료진 소개", "공간 소개"
];
const INSTA_GOALS = ["상담 문의", "저장/공유", "신뢰도 강화", "브랜드 인지도", "이벤트 안내"];
const INSTA_TONES = ["신뢰 중심", "전문적인", "따뜻한", "프리미엄한", "담백한"];
const INSTA_WARNING_TERMS = ["무조건", "100%", "완치", "부작용 없음", "최고", "유일", "보장", "즉시 효과", "평생", "절대"];

type InstaDraft = {
  id: string;
  hospitalName: string;
  format: string;
  goal: string;
  topic: string;
  caption: string;
  hashtags: string[];
  visualGuide: string[];
  uploadChecklist: string[];
  warnings: string[];
  createdAt: string;
};

function findInstaWarnings(text: string) {
  return INSTA_WARNING_TERMS
    .filter((term) => text.includes(term))
    .map((term) => `"${term}" 표현은 보장/과장으로 읽힐 수 있어 검토가 필요합니다.`);
}

function buildInstaCaption(form: {
  hospitalName: string;
  department: string;
  format: string;
  goal: string;
  tone: string;
  topic: string;
  keyMessage: string;
  offer: string;
}) {
  const subject = form.topic || "병원 브랜딩 콘텐츠";
  const hospital = form.hospitalName || "클라이언트 병원";
  const department = form.department ? `${form.department} ` : "";
  const toneLine: Record<string, string> = {
    "신뢰 중심": "사진은 병원의 전문성과 태도를 차분하게 전달하는 첫 장면입니다.",
    "전문적인": "진료의 강점과 공간의 기준이 이미지 안에서 명확하게 보이도록 구성합니다.",
    "따뜻한": "환자가 병원을 떠올릴 때 느끼는 안정감까지 함께 담는 것이 중요합니다.",
    "프리미엄한": "과한 설명보다 정돈된 이미지와 절제된 메시지로 브랜드의 결을 보여줍니다.",
    "담백한": "필요한 정보와 현장의 분위기를 부담 없이 읽히는 문장으로 정리합니다.",
  };
  const goalLine: Record<string, string> = {
    "상담 문의": "상담 전 궁금한 점은 프로필 링크 또는 문의 채널로 남겨주세요.",
    "저장/공유": "나중에 다시 확인할 수 있도록 저장해두면 좋습니다.",
    "신뢰도 강화": "좋은 이미지는 병원이 가진 기준을 오래 기억되게 만듭니다.",
    "브랜드 인지도": "우리 병원이 어떤 분위기와 방향을 가진 곳인지 첫인상에서 드러납니다.",
    "이벤트 안내": "자세한 일정과 조건은 병원 안내 채널에서 확인해주세요.",
  };

  const extra = form.keyMessage ? `\n\n${form.keyMessage}` : "";
  const offer = form.offer ? `\n\n${form.offer}` : "";

  return `${hospital} ${department}${subject}

${toneLine[form.tone] || toneLine["신뢰 중심"]}
${extra}

${goalLine[form.goal] || goalLine["상담 문의"]}${offer}

개인별 상태와 상황에 따라 적합한 방향은 달라질 수 있습니다.`;
}

function makeHashtags(form: { hospitalName: string; department: string; format: string; topic: string; goal: string }) {
  const raw = [
    "포토클리닉",
    "병원브랜딩",
    "병원사진",
    "의료브랜딩",
    form.department,
    form.topic,
    form.format.replace(/\s/g, ""),
    form.goal.replace(/\s/g, ""),
    form.hospitalName,
  ];
  return Array.from(new Set(raw.map((v) => v.replace(/[^\w가-힣]/g, "")).filter(Boolean))).slice(0, 10);
}

function InstagramContentTab() {
  const [form, setForm] = useState({
    hospitalName: "",
    department: "",
    format: "카드뉴스",
    goal: "상담 문의",
    tone: "신뢰 중심",
    topic: "",
    keyMessage: "",
    offer: "",
  });
  const [draft, setDraft] = useState<InstaDraft | null>(null);
  const [saved, setSaved] = useState<InstaDraft[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("pc_insta_content_drafts");
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, []);

  const persist = (items: InstaDraft[]) => {
    setSaved(items);
    localStorage.setItem("pc_insta_content_drafts", JSON.stringify(items));
  };

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const generate = () => {
    if (!form.hospitalName.trim() || !form.topic.trim()) {
      setError("병원명과 콘텐츠 주제를 입력해주세요.");
      return;
    }
    setError("");
    const caption = buildInstaCaption(form);
    const warnings = findInstaWarnings(`${caption}\n${form.offer}\n${form.keyMessage}`);
    const next: InstaDraft = {
      id: Date.now().toString(),
      hospitalName: form.hospitalName,
      format: form.format,
      goal: form.goal,
      topic: form.topic,
      caption,
      hashtags: makeHashtags(form),
      visualGuide: [
        form.format.includes("카드") ? "첫 장은 문제 제기형 제목과 병원명 없이도 이해되는 키비주얼" : "주제와 가장 가까운 대표 사진 1장",
        "인물 사진은 시선, 손동작, 공간 깊이가 보이는 컷 우선",
        "텍스트는 1장당 1메시지, 작은 모바일 화면 기준으로 2줄 이내",
      ],
      uploadChecklist: [
        "의료광고 과장 표현 확인",
        "병원명/진료과/문의 경로 확인",
        "이미지 내 텍스트 오탈자 확인",
        "해시태그 8~10개 이내 정리",
      ],
      warnings,
      createdAt: new Date().toISOString(),
    };
    setDraft(next);
  };

  const saveDraft = () => {
    if (!draft) return;
    persist([draft, ...saved.filter((item) => item.id !== draft.id)].slice(0, 20));
  };

  useSaveShortcut(saveDraft);

  const loadDraft = (item: InstaDraft) => setDraft(item);
  const deleteDraft = (id: string) => persist(saved.filter((item) => item.id !== id));

  return (
    <div className="pc-mobile-stack" style={{ display: "grid", gridTemplateColumns: draft ? "420px 1fr" : "minmax(360px, 640px)", gap: 24, alignItems: "start", justifyContent: draft ? "stretch" : "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Instagram size={16} color={C.teal} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>인스타그램 콘텐츠 제작</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>클라이언트 납품용 캡션, 해시태그, 이미지 가이드를 한 번에 정리합니다.</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>클라이언트 병원명 *</label>
              <input value={form.hospitalName} onChange={(e) => set("hospitalName", e.target.value)} placeholder="예: 포토클리닉" style={iS} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>진료과</label>
              <select value={form.department} onChange={(e) => set("department", e.target.value)} style={iS}>
                <option value="">선택</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 12 }}>콘텐츠 형식</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {INSTA_FORMATS.map((format) => (
              <button key={format} onClick={() => set("format", format)} style={{ padding: "6px 11px", borderRadius: 99, fontSize: 12, fontFamily: "inherit", border: `1.5px solid ${form.format === format ? C.teal : C.border}`, background: form.format === format ? C.light : C.white, color: form.format === format ? C.teal : C.muted, fontWeight: form.format === format ? 800 : 400, cursor: "pointer" }}>
                {format}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 12 }}>목표와 톤</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>목표</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {INSTA_GOALS.map((goal) => (
                  <button key={goal} onClick={() => set("goal", goal)} style={{ padding: "5px 10px", borderRadius: 99, fontSize: 12, fontFamily: "inherit", border: `1.5px solid ${form.goal === goal ? C.orange : C.border}`, background: form.goal === goal ? "#FFF0EB" : C.white, color: form.goal === goal ? C.orange : C.muted, fontWeight: form.goal === goal ? 800 : 400, cursor: "pointer" }}>
                    {goal}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>톤</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {INSTA_TONES.map((tone) => (
                  <button key={tone} onClick={() => set("tone", tone)} style={{ padding: "5px 10px", borderRadius: 99, fontSize: 12, fontFamily: "inherit", border: `1.5px solid ${form.tone === tone ? C.teal : C.border}`, background: form.tone === tone ? C.light : C.white, color: form.tone === tone ? C.teal : C.muted, fontWeight: form.tone === tone ? 800 : 400, cursor: "pointer" }}>
                    {tone}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 12 }}>내용 입력</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>콘텐츠 주제 *</label>
              <input value={form.topic} onChange={(e) => set("topic", e.target.value)} placeholder="예: 여름 피부 상담 전 체크리스트" style={iS} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>핵심 메시지</label>
              <textarea value={form.keyMessage} onChange={(e) => set("keyMessage", e.target.value)} rows={3} placeholder="사진/콘텐츠에 꼭 담아야 할 메시지를 입력하세요." style={taS} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>이벤트/안내 문구</label>
              <input value={form.offer} onChange={(e) => set("offer", e.target.value)} placeholder="예: 6월 상담 예약 가능" style={iS} />
            </div>
          </div>
        </div>

        {error && <div style={{ padding: "10px 14px", background: "#FFF0F0", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: "#DC2626" }}>⚠ {error}</div>}
        <button onClick={generate} className="pc-btn pc-btn--primary pc-btn--lg" style={{ width: "100%" }}>
          <Sparkles size={16} />인스타그램 콘텐츠 생성
        </button>

        {saved.length > 0 && (
          <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 10 }}>저장된 초안</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
              {saved.map((item) => (
                <div key={item.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, background: "#FAFAFA" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#374141" }}>{item.topic}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.hospitalName} · {item.format}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button onClick={() => loadDraft(item)} style={{ flex: 1, height: 28, border: `1px solid ${C.border}`, borderRadius: 7, background: C.white, color: C.teal, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>불러오기</button>
                    <button onClick={() => deleteDraft(item.id)} style={{ width: 48, height: 28, border: "none", borderRadius: 7, background: "#FFF0F0", color: "#DC2626", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {draft && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>📷 인스타그램 캡션</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{draft.hospitalName} · {draft.format} · {draft.goal}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <CopyBtn text={draft.caption} label="캡션 복사" />
                <button onClick={saveDraft} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.teal}`, background: C.light, color: C.teal, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>초안 저장</button>
              </div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.9, color: "#374141", whiteSpace: "pre-wrap", background: "#FAFAFA", borderRadius: 10, padding: "16px 18px" }}>{draft.caption}</div>
            <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>글자 수: {draft.caption.length}자</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>🏷 해시태그</div>
                <CopyBtn text={draft.hashtags.map((tag) => `#${tag}`).join(" ")} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {draft.hashtags.map((tag) => <span key={tag} style={{ background: C.light, color: C.teal, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99 }}>#{tag}</span>)}
              </div>
            </div>
            <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 10 }}>🛡 의료광고 표현 체크</div>
              {draft.warnings.length ? draft.warnings.map((warning, i) => <div key={i} style={{ fontSize: 12, color: C.orange, padding: "4px 0", lineHeight: 1.5 }}>⚠ {warning}</div>) : <div style={{ fontSize: 12, color: "#22876A", fontWeight: 700 }}>주요 주의 표현이 발견되지 않았습니다.</div>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 10 }}>🎨 이미지 제작 가이드</div>
              {draft.visualGuide.map((item, i) => <div key={i} style={{ fontSize: 12, color: C.muted, padding: "4px 0", lineHeight: 1.6 }}>• {item}</div>)}
            </div>
            <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 10 }}>✅ 업로드 체크리스트</div>
              {draft.uploadChecklist.map((item, i) => <div key={i} style={{ fontSize: 12, color: C.muted, padding: "4px 0", lineHeight: 1.6 }}>□ {item}</div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 네이버 플레이스 탭 ───────────────────────────────────────
const PLACE_PURPOSES = [
  "플레이스 소식글", "진료시간 변경 안내", "휴진 안내", "이벤트 안내",
  "신규 장비 소개", "원장 소개", "의료진 소개", "병원 공간 소개",
  "계절성 건강 정보", "주차 안내", "오시는 길 안내", "첫 방문 안내",
  "검진/상담 안내", "시술/진료 안내",
];
const PLACE_TONES = ["따뜻한", "전문적인", "짧고 명확한", "친근한", "프리미엄한"];

type PlaceResult = { titles: string[]; body: string; cta: string; image_suggestions: string[]; upload_checklist: string[]; ad_risk: { level: string; warnings: string[] } };

function NaverPlaceTab() {
  const [form, setForm] = useState({ hospitalName: "", department: "", purpose: "", content: "", tone: "따뜻한", additionalInfo: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<PlaceResult | null>(null);
  const [error, setError]     = useState("");
  const [selectedTitle, setSelectedTitle] = useState(0);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const canGenerate = !!(form.hospitalName && form.purpose);

  const generate = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/naver-place", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "생성 실패");
      setResult(data); setSelectedTitle(0);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const riskColor = { "안전": C.teal, "주의": C.yellow, "위험": C.orange };

  return (
    <div className="pc-mobile-stack" style={{ display: "grid", gridTemplateColumns: result ? "380px 1fr" : "500px", gap: 24, justifyContent: "center" }}>
      {/* 입력 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 14 }}>🏢 클라이언트 정보</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>클라이언트 병원명 *</label><input value={form.hospitalName} onChange={e => set("hospitalName", e.target.value)} placeholder="예: 포토클리닉" style={iS} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>진료과</label><select value={form.department} onChange={e => set("department", e.target.value)} style={iS}><option value="">선택</option>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
          </div>
        </div>

        <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 14 }}>📋 납품 목적 *</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PLACE_PURPOSES.map(p => (
              <button key={p} onClick={() => set("purpose", p)} style={{ padding: "6px 11px", borderRadius: 99, fontSize: 12, fontFamily: "inherit", border: `1.5px solid ${form.purpose === p ? C.teal : C.border}`, background: form.purpose === p ? C.light : C.white, color: form.purpose === p ? C.teal : C.muted, fontWeight: form.purpose === p ? 800 : 400, cursor: "pointer" }}>{p}</button>
            ))}
          </div>
        </div>

        <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 14 }}>✍️ 안내 내용 & 톤</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea value={form.content} onChange={e => set("content", e.target.value)} rows={3} placeholder="예: 이번 주 토요일 오전 진료 후 오후 2시부터 휴진입니다." style={taS} />
            <div><div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>톤</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{PLACE_TONES.map(t => <button key={t} onClick={() => set("tone", t)} style={{ padding: "5px 12px", borderRadius: 99, fontSize: 12, fontFamily: "inherit", border: `1.5px solid ${form.tone === t ? C.orange : C.border}`, background: form.tone === t ? "#FFF0EB" : C.white, color: form.tone === t ? C.orange : C.muted, fontWeight: form.tone === t ? 800 : 400, cursor: "pointer" }}>{t}</button>)}</div></div>
          </div>
        </div>

        <button onClick={generate} disabled={!canGenerate || loading} style={{ width: "100%", height: 50, borderRadius: 12, border: "none", background: canGenerate && !loading ? `linear-gradient(135deg, ${C.teal}, #1e7870)` : "#E5E7EB", color: canGenerate && !loading ? "#fff" : "#9ca3af", fontSize: 15, fontWeight: 900, cursor: canGenerate && !loading ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {loading ? <><div style={{ width: 16, height: 16, border: "2.5px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />생성 중...</> : <><MapPin size={16} />네이버 플레이스 콘텐츠 생성</>}
        </button>
        {error && <div style={{ padding: "10px 14px", background: "#FFF0F0", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: "#DC2626" }}>⚠ {error}</div>}
      </div>

      {/* 결과 */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 제목 후보 */}
          <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 12 }}>📌 제목 후보 (클릭해서 선택)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {result.titles?.map((t, i) => (
                <button key={i} onClick={() => setSelectedTitle(i)} style={{ textAlign: "left", padding: "10px 14px", borderRadius: 9, border: `2px solid ${selectedTitle === i ? C.teal : C.border}`, background: selectedTitle === i ? C.light : "#FAFAFA", color: selectedTitle === i ? C.teal : "#374141", fontWeight: selectedTitle === i ? 800 : 400, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <CopyBtn text={result.titles?.[selectedTitle] || ""} label="선택 제목 복사" />
            </div>
          </div>

          {/* 본문 */}
          <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}><div style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>📝 본문</div><CopyBtn text={result.body} label="본문 복사" /></div>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "#374141", whiteSpace: "pre-wrap", background: "#FAFAFA", borderRadius: 9, padding: "14px 16px" }}>{result.body}</div>
          </div>

          {/* CTA */}
          <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><div style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>📞 예약/전화 유도 문구</div><CopyBtn text={result.cta} /></div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.orange, background: "#FFF8F5", borderRadius: 9, padding: "12px 14px" }}>{result.cta}</div>
          </div>

          {/* 추천 이미지 + 체크리스트 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 10 }}>📷 추천 이미지 유형</div>
              {result.image_suggestions?.map((s, i) => <div key={i} style={{ fontSize: 12, color: C.muted, padding: "4px 0" }}>• {s}</div>)}
            </div>
            <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 10 }}>✅ 업로드 체크리스트</div>
              {result.upload_checklist?.map((c, i) => <div key={i} style={{ fontSize: 12, color: C.muted, padding: "4px 0" }}>□ {c}</div>)}
            </div>
          </div>

          {/* 의료광고 간단 체크 */}
          <div style={{ background: result.ad_risk?.level === "안전" ? "#F0FDF4" : result.ad_risk?.level === "주의" ? "#FFFBEB" : "#FFF5F5", borderRadius: 14, padding: 18, border: `1px solid ${(riskColor as any)[result.ad_risk?.level] || C.border}40` }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: (riskColor as any)[result.ad_risk?.level] || C.teal, marginBottom: 8 }}>
              🛡 의료광고 리스크 — {result.ad_risk?.level || "안전"}
            </div>
            {result.ad_risk?.warnings?.length ? result.ad_risk.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: C.muted }}>⚠ {w}</div>) : <div style={{ fontSize: 12, color: C.muted }}>특별한 위험 표현이 없습니다.</div>}
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── 의료광고 리스크 체크 탭 ──────────────────────────────────
const CONTENT_TYPES = ["인스타그램 캡션", "블로그 글", "네이버 플레이스 소식글", "릴스 자막", "카드뉴스 문구", "홈페이지 문구", "이벤트 문구", "기타"];
const RISK_LEVEL_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  "낮음":  { bg: "#F0FDF4", color: "#22876A", border: "#B2E2CF" },
  "주의":  { bg: "#FFFBEB", color: "#B45309", border: "#FCD34D" },
  "위험":  { bg: "#FFF5F5", color: "#DC2626", border: "#FECACA" },
};

type AdIssue = { original: string; risk_type: string; reason: string; suggestion: string; safe_alternative: string; level: "낮음" | "주의" | "위험" };
type AdCheckResult = { overall_risk: string; issues: AdIssue[]; safe_summary: string; passed_checks: string[] };

function AdCheckTab() {
  const [text, setText]           = useState("");
  const [contentType, setType]    = useState("인스타그램 캡션");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<AdCheckResult | null>(null);
  const [error, setError]         = useState("");

  const check = async () => {
    if (!text.trim()) { setError("검토할 텍스트를 입력해주세요."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/medical-ad-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, contentType }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResult(data);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const overallStyle = RISK_LEVEL_COLORS[result?.overall_risk || "낮음"] || RISK_LEVEL_COLORS["낮음"];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        {/* 입력 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 14 }}>📋 콘텐츠 유형</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CONTENT_TYPES.map(t => <button key={t} onClick={() => setType(t)} style={{ padding: "5px 11px", borderRadius: 99, fontSize: 12, fontFamily: "inherit", border: `1.5px solid ${contentType === t ? C.teal : C.border}`, background: contentType === t ? C.light : C.white, color: contentType === t ? C.teal : C.muted, fontWeight: contentType === t ? 800 : 400, cursor: "pointer" }}>{t}</button>)}
            </div>
          </div>
          <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 10 }}>📝 검토할 텍스트</div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={10} placeholder="인스타그램 캡션, 블로그 글, 플레이스 소식글 등 검토가 필요한 텍스트를 입력하세요." style={{ ...taS, lineHeight: 1.7 }} />
          </div>
          {error && <div style={{ padding: "10px 14px", background: "#FFF0F0", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: "#DC2626" }}>⚠ {error}</div>}
          <button onClick={check} disabled={loading} style={{ width: "100%", height: 50, borderRadius: 12, border: "none", background: loading ? "#9ca3af" : C.teal, color: "#fff", fontSize: 15, fontWeight: 900, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading ? <><div style={{ width: 16, height: 16, border: "2.5px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />분석 중...</> : <><ShieldAlert size={16} />의료광고 리스크 체크</>}
          </button>
        </div>

        {/* 결과 */}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 종합 결과 */}
            <div style={{ background: overallStyle.bg, border: `2px solid ${overallStyle.border}`, borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: overallStyle.color, marginBottom: 6 }}>
                {result.overall_risk === "안전" ? "✅" : result.overall_risk === "주의" ? "⚠️" : "🚨"} 전체 리스크: {result.overall_risk}
              </div>
              <div style={{ fontSize: 13, color: "#374141", lineHeight: 1.7 }}>{result.safe_summary}</div>
            </div>

            {/* 통과 항목 */}
            {result.passed_checks?.length > 0 && (
              <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#22876A", marginBottom: 8 }}>✅ 통과 항목</div>
                {result.passed_checks.map((c, i) => <div key={i} style={{ fontSize: 12, color: C.muted, padding: "3px 0" }}>• {c}</div>)}
              </div>
            )}

            {/* 위험 표현 상세 */}
            {result.issues?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.orange }}>⚠ 발견된 문제 ({result.issues.length}건)</div>
                {result.issues.map((issue, i) => {
                  const lvl = RISK_LEVEL_COLORS[issue.level] || RISK_LEVEL_COLORS["주의"];
                  return (
                    <div key={i} style={{ background: lvl.bg, border: `1px solid ${lvl.border}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                        <AlertTriangle size={14} color={lvl.color} />
                        <span style={{ fontSize: 11, fontWeight: 900, color: lvl.color, background: `${lvl.border}80`, padding: "2px 8px", borderRadius: 99 }}>{issue.level}</span>
                        <span style={{ fontSize: 11, color: C.muted }}>{issue.risk_type}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2B28", marginBottom: 6, background: "#fff8", borderRadius: 6, padding: "6px 10px" }}>
                        원문: "{issue.original}"
                      </div>
                      <div style={{ fontSize: 12, color: "#374141", marginBottom: 8, lineHeight: 1.6 }}>
                        <span style={{ fontWeight: 700 }}>사유:</span> {issue.reason}
                      </div>
                      <div style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: `1px solid ${lvl.border}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#22876A", marginBottom: 4 }}>✏ 수정 제안</div>
                        <div style={{ fontSize: 12, color: "#374141" }}>{issue.suggestion}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── 유튜브 콘텐츠 기획 탭 ───────────────────────────────────
type YoutubeBenchmark = {
  thumbnailCheck: string[];
  firstMinuteSummary: { hook: string; problem: string; core: string; transition: string; summary: string };
  structure: string[];
  features: string[];
  takeaways: string[];
  riskNotes: string[];
};
type YoutubeStory = {
  concept: string;
  hook: string;
  storyStructure: string[];
  storyboard: { time: string; scene: string; caption: string; narration: string }[];
  cta: string;
  thumbnailTexts: string[];
  medicalReview: { risk: string; issues: { original: string; reason: string; safeAlternative: string }[]; checklist: string[] };
};
type ThumbnailGuide = { headlineOptions: string[]; layoutGuide: string[]; colorGuide: string; riskNotes: string[] };

const YOUTUBE_TEMPLATES = [
  { id: "doctor-left", label: "원장 좌측 + 큰 제목", desc: "인물 신뢰감과 강한 문구 중심" },
  { id: "center-bold", label: "중앙 제목 강조", desc: "배경사진 위에 제목을 크게 배치" },
  { id: "split-card", label: "상하 분할 카드", desc: "상단 인물, 하단 핵심 문구" },
];

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function YoutubePlannerTab() {
  const [section, setSection] = useState<"benchmark" | "story" | "thumbnail">("benchmark");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [benchmarkForm, setBenchmarkForm] = useState({ url: "", firstMinuteMemo: "", notes: "" });
  const [benchmark, setBenchmark] = useState<YoutubeBenchmark | null>(null);
  const [storyForm, setStoryForm] = useState({ hospitalName: "", department: "", topic: "", targetAudience: "", tone: "전문적이고 담백한", keyMessage: "" });
  const [story, setStory] = useState<YoutubeStory | null>(null);
  const [thumbForm, setThumbForm] = useState({ hospitalName: "", topic: "", thumbnailText: "", template: "doctor-left", notes: "" });
  const [thumbGuide, setThumbGuide] = useState<ThumbnailGuide | null>(null);
  const [doctorFile, setDoctorFile] = useState<File | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const callYoutubeApi = async (payload: Record<string, any>) => {
    setLoading(payload.mode); setError("");
    try {
      const res = await fetch("/api/youtube-content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "생성 실패");
      return data;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading("");
    }
  };

  const runBenchmark = async () => {
    if (!benchmarkForm.url.trim()) { setError("유튜브 URL을 입력해주세요."); return; }
    const data = await callYoutubeApi({ mode: "benchmark", ...benchmarkForm });
    if (data) { setBenchmark(data); setSection("story"); }
  };

  const runStory = async () => {
    if (!storyForm.hospitalName.trim() || !storyForm.topic.trim()) { setError("병원명과 주제를 입력해주세요."); return; }
    const benchmarkSummary = benchmark ? [
      ...benchmark.takeaways,
      benchmark.firstMinuteSummary?.summary,
      ...benchmark.structure,
    ].filter(Boolean).join("\n") : "";
    const data = await callYoutubeApi({ mode: "story", ...storyForm, benchmarkSummary });
    if (data) {
      setStory(data);
      setThumbForm((prev) => ({ ...prev, hospitalName: storyForm.hospitalName, topic: storyForm.topic, thumbnailText: data.thumbnailTexts?.[0] || prev.thumbnailText }));
      setSection("thumbnail");
    }
  };

  const runThumbGuide = async () => {
    const data = await callYoutubeApi({ mode: "thumbnail", ...thumbForm });
    if (data) {
      setThumbGuide(data);
      if (!thumbForm.thumbnailText && data.headlineOptions?.[0]) setThumbForm((prev) => ({ ...prev, thumbnailText: data.headlineOptions[0] }));
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = 1280, h = 720;
      canvas.width = w; canvas.height = h;
      ctx.fillStyle = "#EAF4F2"; ctx.fillRect(0, 0, w, h);

      if (bgFile) {
        try {
          const bg = await readImage(bgFile);
          if (cancelled) return;
          const scale = Math.max(w / bg.width, h / bg.height);
          const bw = bg.width * scale, bh = bg.height * scale;
          ctx.drawImage(bg, (w - bw) / 2, (h - bh) / 2, bw, bh);
          ctx.fillStyle = "rgba(8,36,34,.42)"; ctx.fillRect(0, 0, w, h);
        } catch {}
      } else {
        ctx.fillStyle = "#155855"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#EAF4F2"; ctx.fillRect(0, h - 170, w, 170);
      }

      if (doctorFile) {
        try {
          const doctor = await readImage(doctorFile);
          if (cancelled) return;
          const targetH = thumbForm.template === "split-card" ? 430 : 640;
          const scale = targetH / doctor.height;
          const dw = doctor.width * scale;
          const x = thumbForm.template === "center-bold" ? 70 : 40;
          const y = thumbForm.template === "split-card" ? 40 : h - targetH;
          ctx.drawImage(doctor, x, y, dw, targetH);
        } catch {}
      }

      const text = thumbForm.thumbnailText || story?.thumbnailTexts?.[0] || "상담 전 꼭 확인할 것";
      ctx.fillStyle = thumbForm.template === "split-card" ? "#155855" : "#FFFFFF";
      ctx.font = "900 74px sans-serif";
      ctx.textAlign = thumbForm.template === "center-bold" ? "center" : "left";
      const maxWidth = thumbForm.template === "center-bold" ? 980 : 680;
      const x = thumbForm.template === "center-bold" ? w / 2 : thumbForm.template === "split-card" ? 70 : 540;
      const y = thumbForm.template === "split-card" ? 565 : 230;
      wrapCanvasText(ctx, text, x, y, maxWidth, 88);
      ctx.fillStyle = "#EB8F22";
      ctx.font = "800 34px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(storyForm.hospitalName || thumbForm.hospitalName || "PHOTO CLINIC", 70, 80);
    }
    draw();
    return () => { cancelled = true; };
  }, [bgFile, doctorFile, thumbForm.thumbnailText, thumbForm.template, thumbForm.hospitalName, storyForm.hospitalName, story]);

  const downloadThumbnail = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/jpeg", 0.92);
    a.download = `youtube_thumbnail_${Date.now()}.jpg`;
    a.click();
  };

  const segmentStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, height: 42, border: `1.5px solid ${active ? C.teal : C.border}`,
    background: active ? C.light : C.white, color: active ? C.teal : C.muted,
    borderRadius: 10, fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 8, background: "rgba(255,255,255,.55)", borderRadius: 12 }}>
        <button onClick={() => setSection("benchmark")} style={segmentStyle(section === "benchmark")}>1. 벤치마킹(URL 분석)</button>
        <button onClick={() => setSection("story")} style={segmentStyle(section === "story")}>2. 스토리 생성</button>
        <button onClick={() => setSection("thumbnail")} style={segmentStyle(section === "thumbnail")}>3. 썸네일 생성</button>
      </div>

      {error && <div style={{ padding: "10px 14px", background: "#FFF0F0", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: "#DC2626" }}>⚠ {error}</div>}

      {section === "benchmark" && (
        <div className="pc-mobile-stack" style={{ display: "grid", gridTemplateColumns: benchmark ? "390px 1fr" : "minmax(420px, 680px)", gap: 20, justifyContent: "center", alignItems: "start" }}>
          <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 12 }}>유튜브 벤치마킹 입력</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={benchmarkForm.url} onChange={(e) => setBenchmarkForm((p) => ({ ...p, url: e.target.value }))} placeholder="유튜브 링크를 붙여넣으세요" style={iS} />
              <textarea value={benchmarkForm.firstMinuteMemo} onChange={(e) => setBenchmarkForm((p) => ({ ...p, firstMinuteMemo: e.target.value }))} rows={6} placeholder={"00초-60초 구간 메모/자막을 붙여넣으면 분석 정확도가 올라갑니다.\n예: 0-5초 원장 질문, 5-15초 환자 고민 설명..."} style={taS} />
              <textarea value={benchmarkForm.notes} onChange={(e) => setBenchmarkForm((p) => ({ ...p, notes: e.target.value }))} rows={3} placeholder="추가로 보고 싶은 포인트: 썸네일, 제목, 편집 리듬 등" style={taS} />
            </div>
            <button onClick={runBenchmark} disabled={loading === "benchmark"} style={{ width: "100%", height: 48, marginTop: 14, border: "none", borderRadius: 12, background: C.teal, color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
              {loading === "benchmark" ? "분석 중..." : "벤치마킹 분석"}
            </button>
          </div>

          {benchmark && (
            <div style={{ display: "grid", gap: 12 }}>
              <ResultCard title="썸네일 체크" items={benchmark.thumbnailCheck} />
              <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 10 }}>00초-60초 구간 내용 체크 / 요약</div>
                {[
                  ["0-5초 훅", benchmark.firstMinuteSummary.hook],
                  ["5-15초 문제 제기", benchmark.firstMinuteSummary.problem],
                  ["15-40초 핵심 전개", benchmark.firstMinuteSummary.core],
                  ["40-60초 전환/CTA", benchmark.firstMinuteSummary.transition],
                  ["요약", benchmark.firstMinuteSummary.summary],
                ].map(([label, value]) => <InfoLine key={label} label={label} value={value} />)}
              </div>
              <ResultCard title="영상 구조 분석" items={benchmark.structure} />
              <ResultCard title="특징 분석" items={benchmark.features} />
              <ResultCard title="적용 포인트" items={benchmark.takeaways} />
            </div>
          )}
        </div>
      )}

      {section === "story" && (
        <div className="pc-mobile-stack" style={{ display: "grid", gridTemplateColumns: story ? "390px 1fr" : "minmax(420px, 680px)", gap: 20, justifyContent: "center", alignItems: "start" }}>
          <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 12 }}>스토리 생성</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input value={storyForm.hospitalName} onChange={(e) => setStoryForm((p) => ({ ...p, hospitalName: e.target.value }))} placeholder="병원명 *" style={iS} />
              <select value={storyForm.department} onChange={(e) => setStoryForm((p) => ({ ...p, department: e.target.value }))} style={iS}><option value="">진료과 선택</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              <input value={storyForm.topic} onChange={(e) => setStoryForm((p) => ({ ...p, topic: e.target.value }))} placeholder="영상 주제 *" style={iS} />
              <input value={storyForm.targetAudience} onChange={(e) => setStoryForm((p) => ({ ...p, targetAudience: e.target.value }))} placeholder="타깃 시청자" style={iS} />
              <input value={storyForm.tone} onChange={(e) => setStoryForm((p) => ({ ...p, tone: e.target.value }))} placeholder="톤" style={iS} />
              <textarea value={storyForm.keyMessage} onChange={(e) => setStoryForm((p) => ({ ...p, keyMessage: e.target.value }))} rows={4} placeholder="반드시 담아야 할 핵심 메시지" style={taS} />
            </div>
            {benchmark && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: C.light, color: C.teal, fontSize: 12, fontWeight: 800 }}>벤치마킹 결과가 스토리에 참고됩니다.</div>}
            <button onClick={runStory} disabled={loading === "story"} style={{ width: "100%", height: 48, marginTop: 14, border: "none", borderRadius: 12, background: C.teal, color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
              {loading === "story" ? "생성 중..." : "스토리 생성 + 의료심의 체크"}
            </button>
          </div>

          {story && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 8 }}>콘셉트</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#374141", marginBottom: 8 }}>{story.concept}</div>
                <div style={{ fontSize: 13, color: C.orange, fontWeight: 800 }}>훅: {story.hook}</div>
              </div>
              <ResultCard title="영상 구조" items={story.storyStructure} />
              <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 10 }}>장면별 스토리보드</div>
                {story.storyboard.map((row) => (
                  <div key={row.time} style={{ borderTop: `1px solid ${C.border}`, padding: "10px 0" }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: C.orange }}>{row.time}</div>
                    <div style={{ fontSize: 13, color: "#374141", fontWeight: 800 }}>{row.scene}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>자막: {row.caption}<br />내레이션: {row.narration}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: story.medicalReview.risk === "위험" ? "#FFF5F5" : story.medicalReview.risk === "주의" ? "#FFFBEB" : "#F0FDF4", borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 8 }}>의료심의 체크 — {story.medicalReview.risk}</div>
                {story.medicalReview.issues?.length > 0 ? story.medicalReview.issues.map((issue, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 8 }}>
                    <strong>{issue.original}</strong>: {issue.reason}<br />대체: {issue.safeAlternative}
                  </div>
                )) : <div style={{ fontSize: 12, color: "#22876A", fontWeight: 800 }}>주요 위험 표현이 발견되지 않았습니다.</div>}
                <div style={{ marginTop: 10 }}>{story.medicalReview.checklist.map((item) => <div key={item} style={{ fontSize: 12, color: C.muted }}>□ {item}</div>)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {section === "thumbnail" && (
        <div className="pc-mobile-stack" style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20, alignItems: "start" }}>
          <div style={{ background: C.white, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 12 }}>썸네일 생성기</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={thumbForm.hospitalName} onChange={(e) => setThumbForm((p) => ({ ...p, hospitalName: e.target.value }))} placeholder="병원명" style={iS} />
              <input value={thumbForm.topic} onChange={(e) => setThumbForm((p) => ({ ...p, topic: e.target.value }))} placeholder="영상 주제" style={iS} />
              <input value={thumbForm.thumbnailText} onChange={(e) => setThumbForm((p) => ({ ...p, thumbnailText: e.target.value }))} placeholder="썸네일 메인 텍스트" style={iS} />
              <select value={thumbForm.template} onChange={(e) => setThumbForm((p) => ({ ...p, template: e.target.value }))} style={iS}>{YOUTUBE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
              <label style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>원장사진<input type="file" accept="image/*" onChange={(e) => setDoctorFile(e.target.files?.[0] || null)} style={{ display: "block", marginTop: 6 }} /></label>
              <label style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>배경사진<input type="file" accept="image/*" onChange={(e) => setBgFile(e.target.files?.[0] || null)} style={{ display: "block", marginTop: 6 }} /></label>
              <textarea value={thumbForm.notes} onChange={(e) => setThumbForm((p) => ({ ...p, notes: e.target.value }))} rows={3} placeholder="원하는 디자인 방향" style={taS} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
              <button onClick={runThumbGuide} disabled={loading === "thumbnail"} style={{ height: 42, border: `1.5px solid ${C.teal}`, borderRadius: 10, background: C.light, color: C.teal, fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>{loading === "thumbnail" ? "추천 중..." : "문구/레이아웃 추천"}</button>
              <button onClick={downloadThumbnail} style={{ height: 42, border: "none", borderRadius: 10, background: C.teal, color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>JPG 다운로드</button>
            </div>
            {thumbGuide && (
              <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                <ResultCard title="문구 후보" items={thumbGuide.headlineOptions} onPick={(text) => setThumbForm((p) => ({ ...p, thumbnailText: text }))} />
                <ResultCard title="레이아웃 가이드" items={thumbGuide.layoutGuide} />
              </div>
            )}
          </div>
          <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: C.teal, fontSize: 13, fontWeight: 900 }}><ImageIcon size={16} />썸네일 미리보기</div>
            <canvas ref={canvasRef} style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 12, background: C.light, display: "block" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ title, items, onPick }: { title: string; items?: string[]; onPick?: (item: string) => void }) {
  return (
    <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 10 }}>{title}</div>
      {(items || []).map((item, i) => (
        <button key={`${item}-${i}`} onClick={() => onPick?.(item)} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: onPick ? "#FAFAFA" : "transparent", borderRadius: 8, padding: "5px 6px", fontSize: 12, color: C.muted, lineHeight: 1.6, cursor: onPick ? "pointer" : "default", fontFamily: "inherit" }}>
          • {item}
        </button>
      ))}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 10, borderTop: `1px solid ${C.border}`, padding: "8px 0", fontSize: 12 }}>
      <div style={{ fontWeight: 900, color: C.teal }}>{label}</div>
      <div style={{ color: C.muted, lineHeight: 1.6 }}>{value}</div>
    </div>
  );
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  let line = "";
  let currentY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
}

// ── 콘텐츠 캘린더 탭 (준비중) ───────────────────────────────
function CalendarTab() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: "#374141", marginBottom: 8 }}>콘텐츠 캘린더</div>
      <div style={{ fontSize: 13, lineHeight: 1.8 }}>
        월별 SNS 포스팅 일정을 자동으로 구성하고,<br />
        블로그·인스타그램·플레이스 콘텐츠를 한 곳에서 관리합니다.<br />
        <span style={{ fontSize: 11, color: C.muted, marginTop: 8, display: "block" }}>2차 업데이트에서 제공될 예정입니다</span>
      </div>
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────────
export default function SnsManagerPage() {
  const [tab, setTab] = useState<TabId>("insta");

  useEffect(() => {
    const initialTab = new URLSearchParams(window.location.search).get("tab") as TabId | null;
    if (initialTab && TABS.some((item) => item.id === initialTab && item.status === "active")) {
      setTab(initialTab);
    }
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <PageHeader title="홍보 콘텐츠 제작" />
      <PageHeading kicker="SNS MANAGER" title="홍보 콘텐츠 제작" desc="블로그·인스타·네이버 플레이스 홍보 콘텐츠를 클라이언트별로 제작합니다." />

      {/* 탭 헤더 */}
      <div className="pc-tabs pc-tabs--global">
        {TABS.map(({ id, label, icon: Icon, status }) => id === "youtube" ? (
          <a key={id} href="/sns-manager?tab=youtube"
            className={`pc-tab${tab === id ? " pc-tab--active" : ""}`}
            style={{ textDecoration: "none" }}>
            <Icon size={13} />
            {label}
          </a>
        ) : (
          <button key={id} onClick={() => status === "active" && setTab(id as TabId)}
            className={`pc-tab${tab === id ? " pc-tab--active" : ""}`}
            style={{ cursor: status === "active" ? "pointer" : "default", color: status === "coming" ? "#C4C4C4" : undefined }}>
            <Icon size={13} />
            {label}
            {status === "coming" && <span style={{ background: "#F3F4F6", color: "#9CA3AF", fontSize: 11, fontWeight: 700, padding: "2px 5px", borderRadius: 99, marginLeft: 2 }}>준비중</span>}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 80px" }}>
        {tab === "insta" && <InstagramContentTab />}
        {tab === "place"    && <NaverPlaceTab />}
        {tab === "blog"     && <PatternBlogWriter />}
        {tab === "youtube"  && <YoutubePlannerTab />}
        {tab === "adcheck"  && <AdCheckTab />}
        {tab === "calendar" && <CalendarTab />}
      </div>
    </div>
  );
}
