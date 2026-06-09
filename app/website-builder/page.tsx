"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Check, Globe2, Pencil, Download,
  RotateCcw, RotateCw, Save, Eye, Palette,
  ChevronRight, Loader2, Phone, MapPin, Clock, Star,
  Building2, User2, FileText, CheckCircle2, AlertCircle
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IntakeData {
  hospitalName: string;
  doctorName: string;
  specialties: string;
  phone: string;
  address: string;
  concept: string;
  pages: string[];
  memo: string;
}

interface SiteContent {
  hero: { headline: string; subline: string; cta: string };
  about: { title: string; body: string };
  services: { name: string; desc: string }[];
  doctors: { name: string; title: string; bio: string }[];
  notice: { title: string; body: string };
  location: { address: string; hours: string; parking: string };
  footer: { copy: string; tagline: string };
  colorTheme: "green" | "blue" | "dark";
  keywords: string[];
}

interface CustomTheme {
  primary: string;   // 주 색상 (헤더·버튼 배경)
  accent: string;    // 강조 색상 (CTA·포인트)
  bg: string;        // 배경 색상
  textColor: string; // 텍스트 색상
  label?: string;
}

interface DesignPrefs {
  referenceUrls: string[];          // 레퍼런스 홈페이지 URL
  layoutStyle: string;              // 레이아웃 스타일
  fontStyle: string;                // 폰트 스타일
  pageType: string;                 // 페이지 구조
  emphasisPoint: string;            // 강조 포인트
  features: string[];               // 원하는 기능
  additionalNote: string;           // 디자인 추가 메모
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS = ["고객 접수", "디자인 선택", "편집", "제작 완료", "배포"];

// 빠른 시작 프리셋
const COLOR_PRESETS: { label: string; theme: CustomTheme }[] = [
  { label: "그린 클린",    theme: { primary: "#155855", accent: "#E85D2C", bg: "#faf7f2", textColor: "#222222" } },
  { label: "블루 프레시",  theme: { primary: "#1a5f9e", accent: "#0ea5e9", bg: "#f0f7ff", textColor: "#1a2a3a" } },
  { label: "다크 프리미엄",theme: { primary: "#1a1a2e", accent: "#d4a843", bg: "#f8f8f6", textColor: "#1a1a2e" } },
  { label: "로즈 케어",    theme: { primary: "#8b3a5a", accent: "#e86a8a", bg: "#fff8f9", textColor: "#2a1a1f" } },
  { label: "퍼플 모던",    theme: { primary: "#4a3580", accent: "#9b6dff", bg: "#f7f5ff", textColor: "#1a1530" } },
  { label: "오렌지 활기",  theme: { primary: "#c24b1a", accent: "#f5a623", bg: "#fffaf5", textColor: "#2a1a0a" } },
  { label: "올리브 내추럴",theme: { primary: "#4a6741", accent: "#8aaa5e", bg: "#f7f9f4", textColor: "#1e2b1c" } },
  { label: "그레이 미니멀",theme: { primary: "#333333", accent: "#666666", bg: "#ffffff", textColor: "#111111" } },
];

const PAGE_OPTIONS = [
  "메인", "병원 소개", "의료진", "진료항목", "예약", "오시는길", "커뮤니티", "이벤트"
];

const SPECIALTIES_LIST = [
  "내과", "소아청소년과", "이비인후과", "피부과", "정형외과", "신경외과",
  "마취통증의학과", "재활의학과", "성형외과", "안과", "치과", "산부인과",
  "비뇨기과", "외과", "정신건강의학과", "한방병원"
];

// (레거시 호환용 - 내부에서만 사용)
const COLOR_THEMES = {
  green: { primary: "#155855", accent: "#E85D2C", bg: "#faf7f2", textColor: "#222222" },
  blue:  { primary: "#1a5f9e", accent: "#0ea5e9", bg: "#f0f7ff", textColor: "#1a2a3a" },
  dark:  { primary: "#1a1a2e", accent: "#d4a843", bg: "#f8f8f6", textColor: "#1a1a2e" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepBar({ current }: { current: Step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
      {STEP_LABELS.map((label, i) => {
        const step = (i + 1) as Step;
        const done = current > step;
        const active = current === step;
        return (
          <div key={step} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: done ? "#155855" : active ? "#E85D2C" : "#e5e0d8",
                color: done || active ? "#fff" : "#999",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, transition: "all .3s"
              }}>
                {done ? <Check size={16} /> : step}
              </div>
              <span style={{ fontSize: 11, color: active ? "#E85D2C" : done ? "#155855" : "#aaa",
                             fontWeight: active ? 700 : 500, whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? "#155855" : "#e5e0d8",
                            margin: "0 4px", marginBottom: 22, transition: "all .3s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Intake Form ──────────────────────────────────────────────────────

function IntakeForm({ data, onChange, onNext }: {
  data: IntakeData;
  onChange: (d: IntakeData) => void;
  onNext: () => void;
}) {
  const [localSpecialty, setLocalSpecialty] = useState("");

  const togglePage = (p: string) => {
    const pages = data.pages.includes(p)
      ? data.pages.filter(x => x !== p)
      : [...data.pages, p];
    onChange({ ...data, pages });
  };

  const setField = (k: keyof IntakeData, v: string) => onChange({ ...data, [k]: v });

  const canNext = data.hospitalName.trim().length > 0;

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: "#222" }}>
        고객 정보 접수
      </h2>
      <p style={{ color: "#666", marginBottom: 28, fontSize: 14 }}>
        제작할 병원 홈페이지의 기본 정보를 입력해주세요.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <label style={labelStyle}>
          병원명 *
          <input style={inputStyle} value={data.hospitalName}
            onChange={e => setField("hospitalName", e.target.value)}
            placeholder="예: 하모니내과의원" />
        </label>
        <label style={labelStyle}>
          대표원장명
          <input style={inputStyle} value={data.doctorName}
            onChange={e => setField("doctorName", e.target.value)}
            placeholder="예: 김하모니 원장" />
        </label>
        <label style={labelStyle}>
          전화번호
          <input style={inputStyle} value={data.phone}
            onChange={e => setField("phone", e.target.value)}
            placeholder="예: 02-1234-5678" />
        </label>
        <label style={labelStyle}>
          주소
          <input style={inputStyle} value={data.address}
            onChange={e => setField("address", e.target.value)}
            placeholder="예: 서울시 강남구 역삼동 123" />
        </label>
      </div>

      <label style={{ ...labelStyle, marginTop: 16 }}>
        진료과목
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {SPECIALTIES_LIST.map(s => (
            <button key={s}
              onClick={() => {
                const current = data.specialties;
                const arr = current ? current.split(", ") : [];
                const next = arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s];
                setField("specialties", next.join(", "));
              }}
              style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                border: data.specialties.includes(s)
                  ? "1.5px solid #155855" : "1.5px solid #ddd",
                background: data.specialties.includes(s) ? "#155855" : "#fff",
                color: data.specialties.includes(s) ? "#fff" : "#555",
                transition: "all .2s"
              }}>
              {s}
            </button>
          ))}
        </div>
      </label>

      <label style={{ ...labelStyle, marginTop: 16 }}>
        구성 페이지
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {PAGE_OPTIONS.map(p => (
            <button key={p}
              onClick={() => togglePage(p)}
              style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                border: data.pages.includes(p)
                  ? "1.5px solid #E85D2C" : "1.5px solid #ddd",
                background: data.pages.includes(p) ? "#E85D2C" : "#fff",
                color: data.pages.includes(p) ? "#fff" : "#555",
                transition: "all .2s"
              }}>
              {p}
            </button>
          ))}
        </div>
      </label>

      <label style={{ ...labelStyle, marginTop: 16 }}>
        분위기 / 콘셉트
        <input style={inputStyle} value={data.concept}
          onChange={e => setField("concept", e.target.value)}
          placeholder="예: 따뜻하고 신뢰감 있는 / 모던하고 깔끔한 / 고급스러운" />
      </label>

      <label style={{ ...labelStyle, marginTop: 16 }}>
        추가 요청 사항
        <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }} value={data.memo}
          onChange={e => setField("memo", e.target.value)}
          placeholder="특별히 강조하고 싶은 내용, 원하는 기능, 레퍼런스 URL 등" />
      </label>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 28 }}>
        <button onClick={onNext} disabled={!canNext}
          style={{
            ...btnPrimary,
            opacity: canNext ? 1 : 0.4, cursor: canNext ? "pointer" : "not-allowed"
          }}>
          다음 단계
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Design Picker ────────────────────────────────────────────────────

function ColorSwatch({ color }: { color: string }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: 6, background: color,
      border: "1.5px solid rgba(0,0,0,.12)", flexShrink: 0
    }} />
  );
}

const LAYOUT_STYLES = [
  { id: "simple",   label: "심플·미니멀", icon: "⬜", desc: "여백 넓고 깔끔" },
  { id: "modern",   label: "모던·세련",   icon: "🔲", desc: "섹션 구분 명확" },
  { id: "warm",     label: "따뜻·친근",   icon: "🟨", desc: "부드럽고 친근" },
  { id: "premium",  label: "고급·프리미엄",icon: "🖤", desc: "고급스럽고 신뢰" },
];

const FONT_STYLES = [
  { id: "gothic",  label: "고딕체",   desc: "가독성 최우선 (추천)" },
  { id: "serif",   label: "명조체",   desc: "고급스럽고 전통적" },
  { id: "round",   label: "둥근 고딕", desc: "부드럽고 친근한 느낌" },
  { id: "mix",     label: "제목 명조 + 본문 고딕", desc: "균형감 있는 조합" },
];

const PAGE_TYPES = [
  { id: "landing",  label: "원페이지 랜딩", desc: "스크롤 하나로 모든 내용" },
  { id: "multi",    label: "멀티페이지",    desc: "메뉴별 페이지 구분" },
  { id: "hybrid",   label: "하이브리드",    desc: "메인 랜딩 + 서브 페이지" },
];

const EMPHASIS_OPTIONS = [
  { id: "doctor",   label: "원장·의료진 중심" },
  { id: "service",  label: "시술·진료항목 중심" },
  { id: "review",   label: "후기·신뢰도 중심" },
  { id: "location", label: "위치·접근성 중심" },
  { id: "equipment",label: "장비·시설 중심" },
];

const FEATURE_OPTIONS = [
  { id: "kakao",    label: "카카오톡 상담 버튼" },
  { id: "naver",    label: "네이버 예약 연동" },
  { id: "map",      label: "지도·오시는길" },
  { id: "popup",    label: "이벤트 팝업" },
  { id: "chat",     label: "채팅 상담 위젯" },
  { id: "gallery",  label: "포토 갤러리" },
  { id: "faq",      label: "FAQ 섹션" },
  { id: "sns",      label: "SNS 링크 (인스타·블로그)" },
  { id: "tel",      label: "전화 클릭 버튼" },
  { id: "review",   label: "후기·리뷰 섹션" },
];

function DesignPicker({ intake, designPrefs, onPrefsChange, onGenerate, isGenerating, content, customTheme, onThemeChange, onNext, onBack }: {
  intake: IntakeData;
  designPrefs: DesignPrefs;
  onPrefsChange: (p: DesignPrefs) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  content: SiteContent | null;
  customTheme: CustomTheme;
  onThemeChange: (t: CustomTheme) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const setColor = (key: keyof CustomTheme, val: string) =>
    onThemeChange({ ...customTheme, [key]: val });

  const setPrefs = (k: keyof DesignPrefs, v: DesignPrefs[keyof DesignPrefs]) =>
    onPrefsChange({ ...designPrefs, [k]: v });

  const toggleFeature = (id: string) => {
    const next = designPrefs.features.includes(id)
      ? designPrefs.features.filter(f => f !== id)
      : [...designPrefs.features, id];
    setPrefs("features", next);
  };

  const addRefUrl = () => setPrefs("referenceUrls", [...designPrefs.referenceUrls, ""]);
  const removeRefUrl = (i: number) =>
    setPrefs("referenceUrls", designPrefs.referenceUrls.filter((_, idx) => idx !== i));
  const updateRefUrl = (i: number, val: string) => {
    const next = [...designPrefs.referenceUrls];
    next[i] = val;
    setPrefs("referenceUrls", next);
  };

  const COLOR_FIELDS: { key: keyof CustomTheme; label: string; desc: string; icon: string }[] = [
    { key: "primary",   label: "주 색상",   desc: "헤더·버튼 배경",  icon: "🎨" },
    { key: "accent",    label: "강조 색상", desc: "CTA·포인트 컬러", icon: "✨" },
    { key: "bg",        label: "배경 색상", desc: "페이지 전체 배경", icon: "🖼" },
    { key: "textColor", label: "텍스트 색", desc: "본문 텍스트 색상", icon: "🔤" },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: "#222" }}>
        홈페이지 디자인
      </h2>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        세부 디자인 방향을 설정하고, AI로 콘텐츠를 자동 생성합니다.
      </p>

      {/* ── 레퍼런스 URL ── */}
      <DesignSection icon="🔗" title="레퍼런스 홈페이지" desc="참고하고 싶은 병원 홈페이지 URL을 입력하세요">
        <div style={{ display: "grid", gap: 8 }}>
          {designPrefs.referenceUrls.map((url, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={url}
                onChange={e => updateRefUrl(i, e.target.value)}
                placeholder={`https://example-hospital.com (레퍼런스 ${i + 1})`}
                style={{ ...miniInputFull, flex: 1 }}
              />
              <button onClick={() => removeRefUrl(i)} style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid #e0dcd4",
                background: "#fff", color: "#aaa", cursor: "pointer", fontSize: 16,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}>×</button>
            </div>
          ))}
          <button onClick={addRefUrl} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8, border: "1.5px dashed #c8d4d0",
            background: "#f8faf9", color: "#155855", fontSize: 12, fontWeight: 600,
            cursor: "pointer", width: "fit-content"
          }}>
            + URL 추가
          </button>
        </div>
        {designPrefs.referenceUrls.some(u => u.trim()) && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "#f0f7f5",
                        borderRadius: 8, fontSize: 12, color: "#155855" }}>
            💡 입력한 URL은 AI 생성 시 디자인 방향 참고에 활용됩니다.
          </div>
        )}
      </DesignSection>

      {/* ── 레이아웃 스타일 ── */}
      <DesignSection icon="🖥" title="레이아웃 스타일" desc="전체적인 디자인 분위기를 선택하세요">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {LAYOUT_STYLES.map(s => (
            <button key={s.id} onClick={() => setPrefs("layoutStyle", s.id)} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
              borderRadius: 10, border: designPrefs.layoutStyle === s.id
                ? "2px solid #155855" : "1.5px solid #e0dcd4",
              background: designPrefs.layoutStyle === s.id ? "#f0f7f5" : "#fff",
              cursor: "pointer", textAlign: "left", transition: "all .15s"
            }}>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700,
                               color: designPrefs.layoutStyle === s.id ? "#155855" : "#333" }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{s.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </DesignSection>

      {/* ── 폰트 스타일 ── */}
      <DesignSection icon="✍️" title="폰트 스타일" desc="글자 스타일을 선택하세요">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {FONT_STYLES.map(f => (
            <button key={f.id} onClick={() => setPrefs("fontStyle", f.id)} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 14px", borderRadius: 10,
              border: designPrefs.fontStyle === f.id ? "2px solid #155855" : "1.5px solid #e0dcd4",
              background: designPrefs.fontStyle === f.id ? "#f0f7f5" : "#fff",
              cursor: "pointer", textAlign: "left", transition: "all .15s"
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700,
                               color: designPrefs.fontStyle === f.id ? "#155855" : "#333" }}>
                  {f.label}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{f.desc}</div>
              </div>
              {designPrefs.fontStyle === f.id && <Check size={14} color="#155855" />}
            </button>
          ))}
        </div>
      </DesignSection>

      {/* ── 페이지 구조 ── */}
      <DesignSection icon="📄" title="페이지 구조" desc="홈페이지 구성 방식을 선택하세요">
        <div style={{ display: "flex", gap: 10 }}>
          {PAGE_TYPES.map(p => (
            <button key={p.id} onClick={() => setPrefs("pageType", p.id)} style={{
              flex: 1, padding: "14px 12px", borderRadius: 10, textAlign: "center",
              border: designPrefs.pageType === p.id ? "2px solid #E85D2C" : "1.5px solid #e0dcd4",
              background: designPrefs.pageType === p.id ? "#fff5f2" : "#fff",
              cursor: "pointer", transition: "all .15s"
            }}>
              <div style={{ fontSize: 13, fontWeight: 700,
                             color: designPrefs.pageType === p.id ? "#E85D2C" : "#333",
                             marginBottom: 4 }}>
                {p.label}
              </div>
              <div style={{ fontSize: 11, color: "#888" }}>{p.desc}</div>
            </button>
          ))}
        </div>
      </DesignSection>

      {/* ── 강조 포인트 ── */}
      <DesignSection icon="⭐" title="강조 포인트" desc="가장 부각시키고 싶은 내용을 선택하세요">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {EMPHASIS_OPTIONS.map(e => (
            <button key={e.id} onClick={() => setPrefs("emphasisPoint", e.id)} style={{
              padding: "7px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              border: designPrefs.emphasisPoint === e.id ? "2px solid #155855" : "1.5px solid #e0dcd4",
              background: designPrefs.emphasisPoint === e.id ? "#155855" : "#fff",
              color: designPrefs.emphasisPoint === e.id ? "#fff" : "#555",
              fontWeight: designPrefs.emphasisPoint === e.id ? 700 : 500,
              transition: "all .15s"
            }}>
              {e.label}
            </button>
          ))}
        </div>
      </DesignSection>

      {/* ── 원하는 기능 ── */}
      <DesignSection icon="⚙️" title="원하는 기능" desc="홈페이지에 포함할 기능을 선택하세요 (복수 선택)">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {FEATURE_OPTIONS.map(f => {
            const on = designPrefs.features.includes(f.id);
            return (
              <button key={f.id} onClick={() => toggleFeature(f.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderRadius: 10, border: on ? "1.5px solid #155855" : "1.5px solid #e0dcd4",
                background: on ? "#f0f7f5" : "#fff", cursor: "pointer",
                textAlign: "left", transition: "all .15s"
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  background: on ? "#155855" : "#fff", border: on ? "none" : "2px solid #ccc",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {on && <Check size={11} color="#fff" />}
                </div>
                <span style={{ fontSize: 12, fontWeight: on ? 700 : 500,
                                color: on ? "#155855" : "#444" }}>
                  {f.label}
                </span>
              </button>
            );
          })}
        </div>
      </DesignSection>

      {/* ── 디자인 추가 메모 ── */}
      <DesignSection icon="📝" title="추가 디자인 요청" desc="위에 없는 내용이나 특별히 원하는 것을 자유롭게 적어주세요">
        <textarea
          value={designPrefs.additionalNote}
          onChange={e => setPrefs("additionalNote", e.target.value)}
          placeholder="예: 원장님 사진을 메인에 크게 넣어주세요 / 영어로 병원명 표기 원해요 / 신생아 촬영 특화 느낌으로 등"
          rows={3}
          style={{ ...miniInputFull, resize: "vertical" }}
        />
      </DesignSection>

      {/* ── 구분선 ── */}
      <div style={{ height: 1, background: "#f0ede8", margin: "24px 0" }} />

      {/* AI Generate */}
      <div style={{
        background: "linear-gradient(135deg, #155855 0%, #1C3F3C 100%)",
        borderRadius: 16, padding: "22px 28px", marginBottom: 28,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20
      }}>
        <div>
          <div style={{ color: "rgba(255,255,255,.6)", fontSize: 11, marginBottom: 5 }}>AI 콘텐츠 자동 생성</div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>
            {intake.hospitalName} 홈페이지 콘텐츠 만들기
          </div>
          <div style={{ color: "rgba(255,255,255,.5)", fontSize: 13, marginTop: 4 }}>
            위 설정을 반영해 헤드라인·소개문·진료항목·공지사항을 GPT-4o로 자동 작성
          </div>
        </div>
        <button onClick={onGenerate} disabled={isGenerating} style={{
          background: "#E85D2C", color: "#fff", border: "none",
          borderRadius: 10, padding: "12px 22px", fontWeight: 700, fontSize: 14,
          cursor: isGenerating ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
          opacity: isGenerating ? 0.7 : 1
        }}>
          {isGenerating
            ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> 생성 중...</>
            : "✨ AI 생성"}
        </button>
      </div>

      {/* ── 컬러 커스터마이저 ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: "#333",
                      display: "flex", alignItems: "center", gap: 6 }}>
          <Palette size={16} color="#E85D2C" /> 컬러 테마 구성
        </div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>
          4가지 색상을 직접 선택하거나, 아래 빠른 프리셋을 클릭하세요.
        </div>

        {/* 라이브 미리보기 바 */}
        <div style={{
          display: "flex", height: 44, borderRadius: 10, overflow: "hidden",
          marginBottom: 18, border: "1px solid #e5e0d8", boxShadow: "0 2px 8px rgba(0,0,0,.06)"
        }}>
          <div style={{ flex: 2, background: customTheme.primary, display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 700, letterSpacing: ".05em" }}>
            PRIMARY
          </div>
          <div style={{ flex: 1, background: customTheme.accent, display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 700 }}>
            ACCENT
          </div>
          <div style={{ flex: 2, background: customTheme.bg, display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 10, color: customTheme.textColor, fontWeight: 700 }}>
            BG + TEXT
          </div>
        </div>

        {/* 색상 피커 4개 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {COLOR_FIELDS.map(({ key, label, desc, icon }) => (
            <label key={key} style={{
              display: "flex", alignItems: "center", gap: 12,
              background: "#f8f7f4", border: "1.5px solid #e8e3db",
              borderRadius: 12, padding: "14px 16px", cursor: "pointer",
              transition: "border-color .2s"
            }}>
              {/* 컬러 인풋 (클릭하면 네이티브 색상 피커 열림) */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: customTheme[key] as string,
                  border: "2px solid rgba(0,0,0,.15)",
                  boxShadow: "0 2px 6px rgba(0,0,0,.12)"
                }} />
                <input
                  type="color"
                  value={customTheme[key] as string}
                  onChange={e => setColor(key, e.target.value)}
                  style={{
                    position: "absolute", inset: 0, opacity: 0,
                    width: "100%", height: "100%", cursor: "pointer", border: "none"
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>{icon} {label}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{desc}</div>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "#aaa", marginTop: 2 }}>
                  {(customTheme[key] as string).toUpperCase()}
                </div>
              </div>
            </label>
          ))}
        </div>

        {/* 빠른 프리셋 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10 }}>
            빠른 프리셋
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COLOR_PRESETS.map((preset) => {
              const isActive =
                customTheme.primary === preset.theme.primary &&
                customTheme.accent === preset.theme.accent;
              return (
                <button
                  key={preset.label}
                  onClick={() => onThemeChange(preset.theme)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 12px", borderRadius: 20, cursor: "pointer",
                    border: isActive ? "2px solid #E85D2C" : "1.5px solid #e0dcd4",
                    background: isActive ? "#fff5f2" : "#fff",
                    transition: "all .15s", fontSize: 12, fontWeight: isActive ? 700 : 500
                  }}>
                  <div style={{ display: "flex", gap: 3 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: preset.theme.primary }} />
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: preset.theme.accent }} />
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: preset.theme.bg,
                                  border: "1px solid #ddd" }} />
                  </div>
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI 생성 결과 미리보기 */}
      {content && (
        <div style={{
          background: "#f8f7f4", borderRadius: 12, padding: "18px 22px",
          border: "1px solid #e5e0d8", marginBottom: 20
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, color: "#333",
                        display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={15} color="#155855" /> AI 생성 콘텐츠 확인
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <PreviewRow label="헤드라인" value={content.hero.headline} />
            <PreviewRow label="소개 제목" value={content.about.title} />
            <PreviewRow label="진료항목" value={content.services.map(s => s.name).join(" · ")} />
            <PreviewRow label="키워드"   value={content.keywords?.join(", ")} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={onBack} style={btnSecondary}>
          <ArrowLeft size={16} /> 이전
        </button>
        <button onClick={onNext} disabled={!content}
          style={{ ...btnPrimary, opacity: content ? 1 : 0.4, cursor: content ? "pointer" : "not-allowed" }}>
          편집 시작 <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#888", minWidth: 72,
                     background: "#eee", padding: "2px 8px", borderRadius: 4 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>{value}</span>
    </div>
  );
}

function DesignSection({ icon, title, desc, children }: {
  icon: string; title: string; desc: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      border: "1.5px solid #e8e3db", borderRadius: 14,
      overflow: "hidden", marginBottom: 16
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "#f8f7f4", padding: "14px 18px",
        borderBottom: "1px solid #e8e3db"
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#222" }}>{title}</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{desc}</div>
        </div>
      </div>
      <div style={{ padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

const miniInputFull: React.CSSProperties = {
  width: "100%", border: "1.5px solid #e0dcd4", borderRadius: 8,
  padding: "9px 12px", fontSize: 13, background: "#fff", color: "#222",
  outline: "none", fontFamily: "inherit"
};

// ─── Step 3: Visual Editor ────────────────────────────────────────────────────

interface EditHistory {
  past: SiteContent[];
  present: SiteContent;
  future: SiteContent[];
}

function WebsiteEditor({ content, customTheme, intake, onSave, onNext, onBack }: {
  content: SiteContent;
  customTheme: CustomTheme;
  intake: IntakeData;
  onSave: (c: SiteContent) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [history, setHistory] = useState<EditHistory>({
    past: [],
    present: deepClone(content),
    future: []
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savedMsg, setSavedMsg] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "edit">("preview");

  const c = history.present;
  const t = { ...customTheme, preview: `linear-gradient(135deg, ${customTheme.primary} 0%, ${customTheme.primary}cc 100%)` };

  const push = (next: SiteContent) => {
    setHistory(h => ({
      past: [...h.past.slice(-30), h.present],
      present: next,
      future: []
    }));
    onSave(next);
  };

  const undo = () => {
    setHistory(h => {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
    });
  };

  const redo = () => {
    setHistory(h => {
      if (!h.future.length) return h;
      const next = h.future[0];
      return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
    });
  };

  const startEdit = (key: string, value: string) => {
    setEditing(key);
    setEditValue(value);
  };

  const commitEdit = () => {
    if (!editing) return;
    const next = deepClone(c);
    const keys = editing.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let obj: any = next;
    for (let i = 0; i < keys.length - 1; i++) {
      if (/^\d+$/.test(keys[i + 1])) {
        obj = obj[keys[i]];
      } else {
        obj = obj[keys[i]];
      }
    }
    obj[keys[keys.length - 1]] = editValue;
    push(next);
    setEditing(null);
  };

  const handleSave = () => {
    onSave(history.present);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  // Inline editable text
  const ET = ({ path, style = {} }: { path: string; style?: React.CSSProperties }) => {
    const keys = path.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let val: any = c;
    for (const k of keys) val = val?.[/^\d+$/.test(k) ? parseInt(k) : k];
    const isEditing = editing === path;
    return isEditing ? (
      <input
        autoFocus
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(null); }}
        style={{
          ...style, background: "rgba(255,255,255,.9)", border: "2px solid #E85D2C",
          borderRadius: 4, padding: "2px 6px", outline: "none", width: "100%"
        }}
      />
    ) : (
      <span
        onClick={() => startEdit(path, String(val || ""))}
        style={{
          ...style, cursor: "text", borderRadius: 4, padding: "1px 4px",
          transition: "all .15s",
          outline: "1px dashed transparent",
        }}
        title="클릭하여 편집"
        className="editable-span"
      >
        {String(val || "")}
      </span>
    );
  };

  return (
    <div>
      {/* Editor Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#1C1C1C", borderRadius: 12, padding: "10px 16px", marginBottom: 16
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={undo} disabled={!history.past.length}
            style={{ ...toolBtn, opacity: history.past.length ? 1 : 0.3 }} title="실행취소">
            <RotateCcw size={15} />
          </button>
          <button onClick={redo} disabled={!history.future.length}
            style={{ ...toolBtn, opacity: history.future.length ? 1 : 0.3 }} title="다시실행">
            <RotateCw size={15} />
          </button>
          <div style={{ width: 1, height: 20, background: "#444", margin: "0 4px" }} />
          <button
            onClick={() => setActiveTab(activeTab === "preview" ? "edit" : "preview")}
            style={{ ...toolBtn, background: activeTab === "edit" ? "#E85D2C" : "transparent" }}>
            {activeTab === "preview" ? <Pencil size={15} /> : <Eye size={15} />}
            <span style={{ fontSize: 12 }}>{activeTab === "preview" ? "편집 패널" : "미리보기"}</span>
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {savedMsg && (
            <span style={{ color: "#4ade80", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <Check size={13} /> 저장됨
            </span>
          )}
          <button onClick={handleSave}
            style={{ ...toolBtn, background: "#155855", padding: "6px 14px" }}>
            <Save size={14} /> 저장
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Edit Panel */}
        {activeTab === "edit" && (
          <div style={{
            width: 280, flexShrink: 0, background: "#fff", borderRadius: 12,
            border: "1px solid #e5e0d8", padding: 16, maxHeight: 680, overflowY: "auto"
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16, color: "#333" }}>
              편집 패널
            </div>

            <EditSection title="히어로 섹션">
              <EditField label="헤드라인" value={c.hero.headline}
                onChange={v => push({ ...deepClone(c), hero: { ...c.hero, headline: v } })} />
              <EditField label="서브 문구" value={c.hero.subline}
                onChange={v => push({ ...deepClone(c), hero: { ...c.hero, subline: v } })} />
              <EditField label="CTA 버튼" value={c.hero.cta}
                onChange={v => push({ ...deepClone(c), hero: { ...c.hero, cta: v } })} />
            </EditSection>

            <EditSection title="병원 소개">
              <EditField label="제목" value={c.about.title}
                onChange={v => push({ ...deepClone(c), about: { ...c.about, title: v } })} />
              <EditField label="본문" value={c.about.body} multiline
                onChange={v => push({ ...deepClone(c), about: { ...c.about, body: v } })} />
            </EditSection>

            <EditSection title="오시는길">
              <EditField label="주소" value={c.location.address}
                onChange={v => push({ ...deepClone(c), location: { ...c.location, address: v } })} />
              <EditField label="진료시간" value={c.location.hours}
                onChange={v => push({ ...deepClone(c), location: { ...c.location, hours: v } })} />
              <EditField label="주차" value={c.location.parking}
                onChange={v => push({ ...deepClone(c), location: { ...c.location, parking: v } })} />
            </EditSection>

            <EditSection title="진료항목" >
              {c.services.map((svc, i) => (
                <div key={i} style={{ marginBottom: 8, background: "#f8f7f4", borderRadius: 8, padding: "8px 10px" }}>
                  <EditField label={`항목 ${i + 1} 이름`} value={svc.name}
                    onChange={v => {
                      const next = deepClone(c);
                      next.services[i].name = v;
                      push(next);
                    }} />
                  <EditField label="설명" value={svc.desc}
                    onChange={v => {
                      const next = deepClone(c);
                      next.services[i].desc = v;
                      push(next);
                    }} />
                </div>
              ))}
            </EditSection>

            <EditSection title="푸터">
              <EditField label="슬로건" value={c.footer.tagline}
                onChange={v => push({ ...deepClone(c), footer: { ...c.footer, tagline: v } })} />
              <EditField label="저작권" value={c.footer.copy}
                onChange={v => push({ ...deepClone(c), footer: { ...c.footer, copy: v } })} />
            </EditSection>
          </div>
        )}

        {/* Preview */}
        <div style={{
          flex: 1, background: "#fff", borderRadius: 12, overflow: "hidden",
          border: "1px solid #e5e0d8", maxHeight: 680, overflowY: "auto"
        }}>
          <style>{`
            .editable-span:hover { outline: 1px dashed #E85D2C !important; background: rgba(232,93,44,.05) !important; }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>

          {/* ── Hero ── */}
          <div style={{
            background: t.preview, padding: "60px 40px", color: "#fff", position: "relative"
          }}>
            <div style={{ fontSize: 11, letterSpacing: ".15em", opacity: .6, marginBottom: 12 }}>
              {intake.hospitalName}
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.4, marginBottom: 12 }}>
              <ET path="hero.headline" style={{ color: "#fff", fontSize: 28, fontWeight: 700 }} />
            </h1>
            <p style={{ opacity: .8, marginBottom: 24, fontSize: 15 }}>
              <ET path="hero.subline" style={{ color: "rgba(255,255,255,.8)", fontSize: 15 }} />
            </p>
            <div style={{
              display: "inline-block", background: t.accent, color: "#fff",
              padding: "10px 24px", borderRadius: 8, fontWeight: 700, fontSize: 14
            }}>
              <ET path="hero.cta" style={{ color: "#fff", fontWeight: 700 }} />
            </div>
            {intake.phone && (
              <div style={{ position: "absolute", top: 20, right: 28, display: "flex",
                            alignItems: "center", gap: 6, fontSize: 13, opacity: .8 }}>
                <Phone size={13} /> {intake.phone}
              </div>
            )}
          </div>

          {/* ── About ── */}
          <div style={{ padding: "40px", borderBottom: "1px solid #f0ede8" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: t.primary,
                          textTransform: "uppercase", marginBottom: 10 }}>About</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 14, color: "#222" }}>
              <ET path="about.title" style={{ fontSize: 20, fontWeight: 700, color: "#222" }} />
            </h2>
            <p style={{ color: "#555", lineHeight: 1.8, fontSize: 14 }}>
              <ET path="about.body" style={{ color: "#555", fontSize: 14 }} />
            </p>
          </div>

          {/* ── Services ── */}
          <div style={{ padding: "40px", background: "#faf8f5", borderBottom: "1px solid #f0ede8" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: t.primary,
                          textTransform: "uppercase", marginBottom: 10 }}>Services</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: "#222" }}>진료항목</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {c.services.map((svc, i) => (
                <div key={i} style={{
                  background: "#fff", borderRadius: 10, padding: "16px 18px",
                  border: "1px solid #e8e5df", transition: "all .2s"
                }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: t.primary, marginBottom: 6 }}>
                    <ET path={`services.${i}.name`} style={{ fontWeight: 700, fontSize: 14, color: t.primary }} />
                  </div>
                  <div style={{ fontSize: 12, color: "#777" }}>
                    <ET path={`services.${i}.desc`} style={{ fontSize: 12, color: "#777" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Doctors ── */}
          <div style={{ padding: "40px", borderBottom: "1px solid #f0ede8" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: t.primary,
                          textTransform: "uppercase", marginBottom: 10 }}>Doctors</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: "#222" }}>의료진</h2>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {c.doctors.map((doc, i) => (
                <div key={i} style={{
                  background: "#f8f7f4", borderRadius: 12, padding: "20px",
                  flex: "1 1 160px", border: "1px solid #e8e5df"
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${t.primary}, ${t.accent})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 12, color: "#fff", fontWeight: 700, fontSize: 18
                  }}>
                    <User2 size={24} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                    <ET path={`doctors.${i}.name`} style={{ fontWeight: 700, fontSize: 15 }} />
                  </div>
                  <div style={{ fontSize: 12, color: t.primary, marginBottom: 6 }}>
                    <ET path={`doctors.${i}.title`} style={{ fontSize: 12, color: t.primary }} />
                  </div>
                  <div style={{ fontSize: 12, color: "#777" }}>
                    <ET path={`doctors.${i}.bio`} style={{ fontSize: 12, color: "#777" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Notice ── */}
          <div style={{
            padding: "24px 40px",
            background: `linear-gradient(135deg, ${t.primary}11 0%, ${t.accent}11 100%)`,
            borderBottom: "1px solid #f0ede8"
          }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <Star size={16} color={t.accent} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                  <ET path="notice.title" style={{ fontWeight: 700, fontSize: 14 }} />
                </div>
                <div style={{ fontSize: 13, color: "#555" }}>
                  <ET path="notice.body" style={{ fontSize: 13, color: "#555" }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Location ── */}
          <div style={{ padding: "40px", background: "#faf8f5", borderBottom: "1px solid #f0ede8" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: t.primary,
                          textTransform: "uppercase", marginBottom: 10 }}>Location</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: "#222" }}>오시는길</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <LocationRow icon={<MapPin size={15} />} label="주소">
                <ET path="location.address" style={{ fontSize: 14 }} />
              </LocationRow>
              <LocationRow icon={<Clock size={15} />} label="진료시간">
                <ET path="location.hours" style={{ fontSize: 14 }} />
              </LocationRow>
              <LocationRow icon={<Building2 size={15} />} label="주차">
                <ET path="location.parking" style={{ fontSize: 14 }} />
              </LocationRow>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ background: t.primary, padding: "28px 40px", color: "#fff" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
              {intake.hospitalName}
            </div>
            <div style={{ fontSize: 12, opacity: .6, marginBottom: 4 }}>
              <ET path="footer.tagline" style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }} />
            </div>
            <div style={{ fontSize: 11, opacity: .4 }}>
              <ET path="footer.copy" style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <button onClick={onBack} style={btnSecondary}>
          <ArrowLeft size={16} /> 이전
        </button>
        <button onClick={onNext} style={btnPrimary}>
          제작 완료 <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function LocationRow({ icon, label, children }: {
  icon: React.ReactNode; label: string; children: React.ReactNode
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ color: "#888", marginTop: 2 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, color: "#444" }}>{children}</div>
      </div>
    </div>
  );
}

function EditSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#f3f2f0", border: "none", borderRadius: 8, padding: "8px 12px",
        fontWeight: 700, fontSize: 12, color: "#444", cursor: "pointer", marginBottom: open ? 8 : 0
      }}>
        {title}
        <ChevronRight size={13} style={{ transform: open ? "rotate(90deg)" : "none", transition: ".2s" }} />
      </button>
      {open && <div style={{ paddingLeft: 4 }}>{children}</div>}
    </div>
  );
}

function EditField({ label, value, onChange, multiline }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean;
}) {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => setLocalVal(value), [value]);
  const commit = () => { if (localVal !== value) onChange(localVal); };

  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 }}>
        {label}
      </span>
      {multiline ? (
        <textarea value={localVal} onChange={e => setLocalVal(e.target.value)} onBlur={commit}
          rows={3} style={{ ...miniInput, resize: "vertical" }} />
      ) : (
        <input value={localVal} onChange={e => setLocalVal(e.target.value)} onBlur={commit}
          style={miniInput} />
      )}
    </label>
  );
}

// ─── Step 4: Complete ─────────────────────────────────────────────────────────

function CompletionView({ intake, content, customTheme, onNext, onBack }: {
  intake: IntakeData;
  content: SiteContent;
  customTheme: CustomTheme;
  onNext: () => void;
  onBack: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  const generateHTML = () => {
    const t = { ...customTheme, preview: `linear-gradient(135deg, ${customTheme.primary} 0%, ${customTheme.primary}cc 100%)` };
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${intake.hospitalName}</title>
<meta name="description" content="${content.about.body.slice(0, 120)}" />
<meta name="keywords" content="${content.keywords?.join(", ")}" />
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Apple SD Gothic Neo',sans-serif;color:#222;line-height:1.75;word-break:keep-all}
img{max-width:100%;display:block}
a{color:inherit;text-decoration:none}
.container{max-width:1100px;margin:0 auto;padding:0 40px}
header{background:${t.primary};padding:16px 0;position:sticky;top:0;z-index:100}
header .wrap{display:flex;justify-content:space-between;align-items:center;max-width:1100px;margin:0 auto;padding:0 40px}
header .logo{color:#fff;font-weight:800;font-size:18px}
header nav a{color:rgba(255,255,255,.8);margin-left:28px;font-size:14px}
.hero{background:${t.preview};padding:100px 40px;text-align:center;color:#fff}
.hero h1{font-size:2.4rem;font-weight:800;line-height:1.4;margin-bottom:16px}
.hero p{font-size:1.1rem;opacity:.8;margin-bottom:32px}
.btn{display:inline-block;background:${t.accent};color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px}
.section{padding:64px 0}
.section-label{font-size:11px;font-weight:700;letter-spacing:.15em;color:${t.primary};text-transform:uppercase;margin-bottom:12px}
.section h2{font-size:1.6rem;font-weight:700;margin-bottom:24px}
.services-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.service-card{background:#fff;border:1px solid #e8e5df;border-radius:12px;padding:20px}
.service-card h3{font-size:15px;font-weight:700;color:${t.primary};margin-bottom:8px}
.service-card p{font-size:13px;color:#777}
.doctors-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px}
.doc-card{background:#f8f7f4;border-radius:12px;padding:24px;text-align:center}
.doc-avatar{width:64px;height:64px;border-radius:50%;background:${t.primary};margin:0 auto 14px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px}
.doc-name{font-weight:700;font-size:16px;margin-bottom:4px}
.doc-title{font-size:12px;color:${t.primary};margin-bottom:6px}
.doc-bio{font-size:12px;color:#777}
.location-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px}
.location-item label{font-size:11px;font-weight:700;color:#999;display:block;margin-bottom:6px}
.location-item p{font-size:14px;color:#444}
footer{background:${t.primary};color:#fff;padding:36px 0}
footer .tagline{opacity:.6;font-size:13px;margin-top:8px}
footer .copy{opacity:.4;font-size:12px;margin-top:6px}
@media(max-width:768px){.hero{padding:60px 24px}.hero h1{font-size:1.6rem}.services-grid,.doctors-grid{grid-template-columns:1fr}.location-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<header><div class="wrap"><a class="logo" href="#">${intake.hospitalName}</a><nav><a href="#about">소개</a><a href="#services">진료항목</a><a href="#doctors">의료진</a><a href="#location">오시는길</a></nav></div></header>
<section class="hero"><div class="container"><h1>${content.hero.headline}</h1><p>${content.hero.subline}</p><a class="btn" href="tel:${intake.phone}">${content.hero.cta}</a></div></section>
<section class="section" id="about"><div class="container"><div class="section-label">About</div><h2>${content.about.title}</h2><p>${content.about.body}</p></div></section>
<section class="section" id="services" style="background:#faf8f5"><div class="container"><div class="section-label">Services</div><h2>진료항목</h2><div class="services-grid">${content.services.map(s => `<div class="service-card"><h3>${s.name}</h3><p>${s.desc}</p></div>`).join("")}</div></div></section>
<section class="section" id="doctors"><div class="container"><div class="section-label">Doctors</div><h2>의료진</h2><div class="doctors-grid">${content.doctors.map(d => `<div class="doc-card"><div class="doc-avatar">👨‍⚕️</div><div class="doc-name">${d.name}</div><div class="doc-title">${d.title}</div><div class="doc-bio">${d.bio}</div></div>`).join("")}</div></div></section>
<section class="section" id="location" style="background:#faf8f5"><div class="container"><div class="section-label">Location</div><h2>오시는길</h2><div class="location-grid"><div><div class="location-item"><label>주소</label><p>${content.location.address || intake.address}</p></div><div class="location-item" style="margin-top:20px"><label>진료시간</label><p>${content.location.hours}</p></div></div><div class="location-item"><label>주차</label><p>${content.location.parking}</p></div></div></div></section>
<footer><div class="container"><div style="font-weight:800;font-size:18px">${intake.hospitalName}</div><div class="tagline">${content.footer.tagline}</div><div class="copy">${content.footer.copy}</div></div></footer>
</body>
</html>`;
  };

  const handleDownload = () => {
    setDownloading(true);
    const html = generateHTML();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${intake.hospitalName.replace(/\s/g, "_")}_homepage.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setTimeout(() => setDownloading(false), 800);
  };

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: "#222" }}>제작 완료 🎉</h2>
      <p style={{ color: "#666", marginBottom: 28, fontSize: 14 }}>
        {intake.hospitalName} 홈페이지 제작이 완료되었습니다.
      </p>

      {/* 완료 카드 */}
      <div style={{
        background: "linear-gradient(135deg, #155855 0%, #1C3F3C 100%)",
        borderRadius: 16, padding: "32px 36px", color: "#fff", marginBottom: 24
      }}>
        <CheckCircle2 size={40} color="#4ade80" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          {intake.hospitalName}
        </div>
        <div style={{ opacity: .7, fontSize: 14, marginBottom: 20 }}>
          {content.hero.headline}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={badgeStyle}><Globe2 size={12} /> {intake.pages?.join(" · ") || "메인 페이지"}</div>
          <div style={badgeStyle}>
            <Palette size={12} />
            <div style={{ display: "flex", gap: 3 }}>
              {[customTheme.primary, customTheme.accent, customTheme.bg].map((c, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c, border: "1px solid rgba(255,255,255,.3)" }} />
              ))}
            </div>
            커스텀 테마
          </div>
          <div style={badgeStyle}><FileText size={12} /> {content.services.length}개 진료항목</div>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <button onClick={handleDownload}
          style={{
            ...btnPrimary, justifyContent: "center", padding: "16px",
            fontSize: 15, borderRadius: 12
          }}>
          {downloading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={16} />}
          HTML 다운로드
        </button>
        <button onClick={onBack}
          style={{
            ...btnSecondary, justifyContent: "center", padding: "16px",
            fontSize: 15, borderRadius: 12
          }}>
          <Pencil size={16} /> 편집 계속
        </button>
      </div>

      {/* 체크리스트 */}
      <div style={{ background: "#f8f7f4", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#333" }}>다음 단계 체크리스트</div>
        {[
          { done: true, text: "기본 콘텐츠 작성 완료" },
          { done: true, text: "디자인 테마 적용 완료" },
          { done: false, text: "실제 병원 사진 교체 필요" },
          { done: false, text: "전화번호·주소 최종 확인" },
          { done: false, text: "도메인 연결 및 배포" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              background: item.done ? "#4ade80" : "#e5e0d8",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
            }}>
              {item.done ? <Check size={12} color="#fff" /> : <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#bbb" }} />}
            </div>
            <span style={{ fontSize: 13, color: item.done ? "#444" : "#888" }}>{item.text}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onNext} style={btnPrimary}>
          도메인 연결 및 배포 <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: Deploy Guide ─────────────────────────────────────────────────────

function DeployGuide({ intake, onBack }: { intake: IntakeData; onBack: () => void }) {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(key);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: "#222" }}>
        도메인 연결 및 배포
      </h2>
      <p style={{ color: "#666", marginBottom: 28, fontSize: 14 }}>
        완성된 홈페이지를 실제로 인터넷에 올리는 방법입니다.
      </p>

      {/* 방법 1 - Netlify Drop */}
      <DeployCard
        step="01" title="Netlify Drop (가장 빠름)"
        badge="무료 · 5분 완성" badgeColor="#00ad9f"
        desc="다운로드한 HTML 파일을 Netlify Drop 사이트에 드래그앤드롭만 하면 바로 배포됩니다."
        steps={[
          "HTML 파일을 다운로드",
          "netlify.com/drop 접속",
          "파일을 드래그앤드롭",
          "자동 생성된 URL 확인 및 공유"
        ]}
        note="무료 플랜: yoursite.netlify.app 형태의 URL 제공"
        link="https://app.netlify.com/drop"
      />

      {/* 방법 2 - Cafe24 도메인 */}
      <DeployCard
        step="02" title="카페24 도메인 + 호스팅"
        badge="연 2-5만원" badgeColor="#E85D2C"
        desc="병원명.com 같은 직접 도메인이 필요할 때. 카페24 공유호스팅 + 도메인 등록"
        steps={[
          `카페24에서 도메인 검색: ${intake.hospitalName.replace(/\s/g, "")}`,
          "호스팅 신청 (Basic, 연 24,000원)",
          "FTP로 HTML 파일 업로드",
          "도메인 연결 완료"
        ]}
        note="병원 도메인: .com .co.kr .clinic 추천"
        link="https://www.cafe24.com"
      />

      {/* 방법 3 - Vercel */}
      <DeployCard
        step="03" title="Vercel (개발자용)"
        badge="무료 · 빠른 CDN" badgeColor="#000"
        desc="GitHub에 올리고 Vercel로 배포하면 전세계 CDN 자동 적용. 기술 담당자 있을 때 추천."
        steps={[
          "GitHub 저장소 생성",
          "HTML 파일 업로드",
          "vercel.com에서 Import",
          "자동 배포 완료"
        ]}
        note="yoursite.vercel.app 무료 · 커스텀 도메인 연결 가능"
        link="https://vercel.com"
      />

      {/* 체크리스트 */}
      <div style={{ background: "#f8f7f4", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>배포 전 최종 확인</div>
        {[
          "전화번호가 실제 번호인지 확인",
          "주소·진료시간 정확한지 확인",
          "사진을 실제 병원 사진으로 교체",
          "모바일 화면에서 확인",
          "네이버 플레이스에도 홈페이지 URL 등록",
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <AlertCircle size={14} color="#E85D2C" />
            <span style={{ fontSize: 13, color: "#555" }}>{item}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={onBack} style={btnSecondary}>
          <ArrowLeft size={16} /> 이전
        </button>
        <Link href="/" style={{ ...btnPrimary, textDecoration: "none" }}>
          관리자 홈으로 <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function DeployCard({ step, title, badge, badgeColor, desc, steps, note, link }: {
  step: string; title: string; badge: string; badgeColor: string;
  desc: string; steps: string[]; note: string; link: string;
}) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e0d8", borderRadius: 14,
      padding: "24px 28px", marginBottom: 16
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{
            background: "#f3f2f0", borderRadius: 8, padding: "4px 10px",
            fontSize: 12, fontWeight: 700, color: "#555"
          }}>{step}</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
        </div>
        <div style={{
          background: badgeColor + "20", color: badgeColor,
          borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700
        }}>{badge}</div>
      </div>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 14 }}>{desc}</p>
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", background: "#f3f2f0",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "#666", flexShrink: 0
            }}>{i + 1}</div>
            <span style={{ fontSize: 13, color: "#444" }}>{s}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#888", background: "#faf8f5", borderRadius: 8, padding: "8px 12px" }}>
        💡 {note}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: "#555", lineHeight: 1
};
const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", marginTop: 8,
  border: "1.5px solid #e0dcd4", borderRadius: 9, padding: "10px 14px",
  fontSize: 14, background: "#fff", color: "#222", outline: "none"
};
const miniInput: React.CSSProperties = {
  width: "100%", border: "1px solid #e0dcd4", borderRadius: 6,
  padding: "6px 10px", fontSize: 12, background: "#fff", color: "#222", outline: "none"
};
const btnPrimary: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  background: "#155855", color: "#fff", border: "none",
  borderRadius: 10, padding: "12px 22px", fontWeight: 700, fontSize: 14,
  cursor: "pointer"
};
const btnSecondary: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  background: "#fff", color: "#555", border: "1.5px solid #e0dcd4",
  borderRadius: 10, padding: "12px 22px", fontWeight: 600, fontSize: 14,
  cursor: "pointer"
};
const toolBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  background: "transparent", color: "#aaa", border: "none",
  borderRadius: 7, padding: "6px 10px", cursor: "pointer", fontSize: 13
};
const badgeStyle: React.CSSProperties = {
  background: "rgba(255,255,255,.15)", borderRadius: 20,
  padding: "4px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const defaultIntake: IntakeData = {
  hospitalName: "", doctorName: "", specialties: "", phone: "",
  address: "", concept: "", pages: ["메인", "소개", "진료항목", "오시는길"], memo: ""
};

export default function WebsiteBuilderPage() {
  const [step, setStep] = useState<Step>(1);
  const [intake, setIntake] = useState<IntakeData>(() => {
    if (typeof window === "undefined") return defaultIntake;
    const p = new URLSearchParams(window.location.search);
    return {
      hospitalName: p.get("hospitalName") || "",
      doctorName:   p.get("doctorName") || "",
      specialties:  p.get("specialties") || "",
      phone:        p.get("phone") || "",
      address:      p.get("address") || "",
      concept:      p.get("concept") || "",
      pages:        ["메인", "소개", "진료항목", "오시는길"],
      memo:         p.get("memo") || "",
    };
  });
  const [content, setContent] = useState<SiteContent | null>(null);
  const [customTheme, setCustomTheme] = useState<CustomTheme>(COLOR_PRESETS[0].theme);
  const [designPrefs, setDesignPrefs] = useState<DesignPrefs>({
    referenceUrls: [""],
    layoutStyle: "simple",
    fontStyle: "gothic",
    pageType: "multi",
    emphasisPoint: "doctor",
    features: ["kakao", "map", "tel"],
    additionalNote: "",
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/website-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...intake, designPrefs })
      });
      const data = await res.json();
      if (data.content) {
        setContent(data.content);
        // AI가 추천한 colorTheme이 있으면 해당 프리셋으로 자동 적용
        if (data.content.colorTheme) {
          const preset = COLOR_PRESETS.find(p =>
            p.label === (data.content.colorTheme === "green" ? "그린 클린" :
                         data.content.colorTheme === "blue"  ? "블루 프레시" : "다크 프리미엄")
          );
          if (preset) setCustomTheme(preset.theme);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="admin-shell">
      <section className="admin-dashboard" style={{ maxWidth: 900 }}>
        <header className="admin-dashboard-header">
          <div className="brand-lockup">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" />
            <span>Website Builder</span>
          </div>
          <Link href="/" className="admin-secondary-link" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ArrowLeft size={16} /> 관리자 홈
          </Link>
        </header>

        <div style={{ padding: "12px 0 0" }}>
          <StepBar current={step} />

          <div style={{
            background: "#fff", borderRadius: 16, padding: "32px 36px",
            border: "1px solid #e8e3db"
          }}>
            {step === 1 && (
              <IntakeForm
                data={intake}
                onChange={setIntake}
                onNext={() => setStep(2)}
              />
            )}
            {step === 2 && (
              <DesignPicker
                intake={intake}
                designPrefs={designPrefs}
                onPrefsChange={setDesignPrefs}
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                content={content}
                customTheme={customTheme}
                onThemeChange={setCustomTheme}
                onNext={() => setStep(3)}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && content && (
              <WebsiteEditor
                content={content}
                customTheme={customTheme}
                intake={intake}
                onSave={setContent}
                onNext={() => setStep(4)}
                onBack={() => setStep(2)}
              />
            )}
            {step === 4 && content && (
              <CompletionView
                intake={intake}
                content={content}
                customTheme={customTheme}
                onNext={() => setStep(5)}
                onBack={() => setStep(3)}
              />
            )}
            {step === 5 && (
              <DeployGuide
                intake={intake}
                onBack={() => setStep(4)}
              />
            )}
          </div>
        </div>
      </section>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
