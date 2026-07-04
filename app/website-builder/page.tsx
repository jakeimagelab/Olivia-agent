"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";
import {
  ArrowLeft, ArrowRight, Check, Globe2, Pencil, Download,
  RotateCcw, RotateCw, Save, Eye, Palette,
  Loader2, FileText, CheckCircle2, AlertCircle, Layout
} from "lucide-react";
import { TEMPLATES, getTemplateById } from "./templates";

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

function DesignPicker({ intake, designPrefs, onPrefsChange, onGenerate, isGenerating, content, customTheme, onThemeChange, selectedTemplateId, onTemplateChange, onNext, onBack }: {
  intake: IntakeData;
  designPrefs: DesignPrefs;
  onPrefsChange: (p: DesignPrefs) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  content: SiteContent | null;
  customTheme: CustomTheme;
  onThemeChange: (t: CustomTheme) => void;
  selectedTemplateId: string;
  onTemplateChange: (id: string) => void;
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
        템플릿을 선택하고, 세부 디자인 방향을 설정한 뒤 AI로 콘텐츠를 자동 생성합니다.
      </p>

      {/* ── 템플릿 선택 ── */}
      <DesignSection icon="🖼" title="템플릿 선택" desc="홈페이지 레이아웃 스타일을 선택하세요">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {TEMPLATES.map(tpl => {
            const selected = selectedTemplateId === tpl.id;
            return (
              <button key={tpl.id} onClick={() => onTemplateChange(tpl.id)} style={{
                padding: 0, borderRadius: 14, cursor: "pointer", textAlign: "left",
                border: selected ? `2.5px solid ${tpl.tagColor}` : "1.5px solid #e0dcd4",
                background: "#fff", overflow: "hidden", transition: "all .15s",
                boxShadow: selected ? `0 4px 16px ${tpl.tagColor}33` : "none"
              }}>
                {/* 미리보기 스켈레톤 */}
                <div style={{
                  background: tpl.previewBg, height: 80, padding: "10px 12px",
                  display: "flex", flexDirection: "column", gap: 6, position: "relative"
                }}>
                  <div style={{ height: 10, borderRadius: 4, background: tpl.previewLines[0], width: "60%" }} />
                  <div style={{ height: 7, borderRadius: 4, background: tpl.previewLines[0] + "66", width: "80%" }} />
                  <div style={{ height: 7, borderRadius: 4, background: tpl.previewLines[0] + "44", width: "50%" }} />
                  <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ flex: 1, height: 20, borderRadius: 6, background: tpl.previewLines[2] }} />
                    ))}
                  </div>
                  {selected && (
                    <div style={{
                      position: "absolute", top: 8, right: 8,
                      width: 20, height: 20, borderRadius: "50%",
                      background: tpl.tagColor, display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      <Check size={11} color="#fff" />
                    </div>
                  )}
                </div>
                {/* 정보 */}
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#222" }}>{tpl.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                      background: tpl.tagColor + "18", color: tpl.tagColor
                    }}>{tpl.tag}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", lineHeight: 1.5 }}>{tpl.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 10, padding: "10px 14px", background: "#f0f7f5",
                      borderRadius: 8, fontSize: 12, color: "#155855" }}>
          💡 나중에 더 많은 템플릿이 추가될 예정입니다. 편집 화면에서도 변경 가능합니다.
        </div>
      </DesignSection>

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

// ─── Step 3: Inline Editor ────────────────────────────────────────────────────

const MEDICAL_EMOJIS = [
  "💊","🩺","🔬","💉","🏥","❤️‍🩹","🧬","👁️","🦷","🦴","🧠","🫁",
  "🩻","🩹","💆‍♀️","🌡️","🩸","🧪","⚕️","🌿","🌸","🏃","💪","🫀",
  "🫂","✨","🎯","📋","🔍","📅","🗓️","📞","🏆","⭐","💫","🎗️","🔒","🌟","💎","🎪"
];

interface SelectedElInfo {
  field: string;
  editType: "text" | "bg" | "icon" | "img";
  value: string;
  rect: { top: number; left: number; width: number; height: number };
  computedStyle: { color: string; fontSize: number; fontWeight: string; bg: string };
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return rgb.startsWith("#") ? rgb : "#000000";
  return "#" + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, "0")).join("");
}

const tbFloatBtn: React.CSSProperties = {
  background: "rgba(255,255,255,.12)", border: "none", borderRadius: 6,
  color: "#fff", padding: "5px 9px", fontSize: 12, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

function FloatingToolbar({ sel, iframeRect, onSendStyle, onClose }: {
  sel: SelectedElInfo;
  iframeRect: DOMRect | null;
  onSendStyle: (style: Record<string, string>) => void;
  onClose: () => void;
}) {
  if (!iframeRect) return null;
  const rawTop = iframeRect.top + sel.rect.top - 58;
  const toolbarTop = rawTop < 8 ? iframeRect.top + sel.rect.top + sel.rect.height + 8 : rawTop;
  const toolbarLeft = Math.max(8, Math.min(iframeRect.left + sel.rect.left, window.innerWidth - 460));

  const base: React.CSSProperties = {
    position: "fixed", top: toolbarTop, left: toolbarLeft, zIndex: 9999,
    background: "#1C1C1C", borderRadius: 12, padding: "8px 10px",
    display: "flex", alignItems: "center", gap: 6,
    boxShadow: "0 8px 32px rgba(0,0,0,.55)", flexWrap: "wrap", maxWidth: 460,
  };
  const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
  const curSize = parseFloat(String(sel.computedStyle.fontSize)) || 16;
  const isBold = String(sel.computedStyle.fontWeight) === "700" || Number(sel.computedStyle.fontWeight) >= 700;

  if (sel.editType === "text") {
    return (
      <div style={base} onMouseDown={e => e.stopPropagation()}>
        <button onClick={() => onSendStyle({ fontSize: `${Math.max(10, curSize - 2)}px` })}
          style={tbFloatBtn} title="작게">A-</button>
        <select value={curSize}
          onChange={e => onSendStyle({ fontSize: `${e.target.value}px` })}
          style={{ background: "#333", color: "#fff", border: "none", borderRadius: 6,
                   padding: "4px 6px", fontSize: 12, cursor: "pointer" }}>
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
        </select>
        <button onClick={() => onSendStyle({ fontSize: `${Math.min(96, curSize + 2)}px` })}
          style={tbFloatBtn} title="크게">A+</button>
        <div style={{ width: 1, height: 20, background: "#555" }} />
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }} title="글자 색상">
          <span style={{ fontSize: 11, color: "#aaa" }}>색</span>
          <input type="color" defaultValue={rgbToHex(String(sel.computedStyle.color))}
            onChange={e => onSendStyle({ color: e.target.value })}
            style={{ width: 28, height: 22, border: "none", borderRadius: 4, cursor: "pointer", background: "transparent" }} />
        </label>
        <div style={{ width: 1, height: 20, background: "#555" }} />
        <button onClick={() => onSendStyle({ fontWeight: isBold ? "400" : "700" })}
          style={{ ...tbFloatBtn, background: isBold ? "#E85D2C" : "rgba(255,255,255,.1)", fontWeight: 700 }}>B</button>
        <div style={{ width: 1, height: 20, background: "#555" }} />
        <button onClick={onClose} style={{ ...tbFloatBtn, color: "#888" }}>✕</button>
      </div>
    );
  }
  if (sel.editType === "bg") {
    return (
      <div style={base} onMouseDown={e => e.stopPropagation()}>
        <span style={{ fontSize: 11, color: "#aaa" }}>배경색</span>
        <input type="color" defaultValue="#ffffff"
          onChange={e => onSendStyle({ bg: e.target.value })}
          style={{ width: 36, height: 26, border: "none", borderRadius: 4, cursor: "pointer" }} />
        <button onClick={onClose} style={{ ...tbFloatBtn, color: "#888" }}>✕</button>
      </div>
    );
  }
  if (sel.editType === "icon") {
    return (
      <div style={{ ...base, maxWidth: 360, gap: 4, padding: "10px 12px" }}
        onMouseDown={e => e.stopPropagation()}>
        <span style={{ fontSize: 11, color: "#aaa", width: "100%", marginBottom: 4 }}>아이콘 선택</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {MEDICAL_EMOJIS.map(em => (
            <button key={em} onClick={() => { onSendStyle({ content: em }); onClose(); }}
              style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 6,
                       padding: "4px 5px", fontSize: 20, cursor: "pointer" }}>{em}</button>
          ))}
        </div>
        <button onClick={onClose} style={{ ...tbFloatBtn, color: "#888", alignSelf: "flex-start", marginTop: 4 }}>✕</button>
      </div>
    );
  }
  if (sel.editType === "img") {
    return (
      <div style={{ ...base, flexDirection: "column", alignItems: "stretch", gap: 8, padding: "12px 14px" }}
        onMouseDown={e => e.stopPropagation()}>
        <span style={{ fontSize: 11, color: "#aaa" }}>이미지 URL</span>
        <div style={{ display: "flex", gap: 6 }}>
          <input id="wb-img-url" type="text" placeholder="https://..." defaultValue={sel.value}
            style={{ flex: 1, background: "#333", color: "#fff", border: "1px solid #555",
                     borderRadius: 6, padding: "6px 10px", fontSize: 12 }} />
          <button onClick={() => {
            const url = (document.getElementById("wb-img-url") as HTMLInputElement)?.value;
            if (url) { onSendStyle({ src: url }); onClose(); }
          }} style={{ ...tbFloatBtn, background: "#E85D2C", padding: "6px 12px" }}>적용</button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <span style={{ fontSize: 11, color: "#aaa" }}>또는 파일 업로드</span>
          <input type="file" accept="image/*" id="wb-img-file" style={{ display: "none" }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => {
                if (ev.target?.result) { onSendStyle({ src: ev.target.result as string }); onClose(); }
              };
              reader.readAsDataURL(file);
            }} />
          <label htmlFor="wb-img-file" style={{ ...tbFloatBtn, background: "#155855", cursor: "pointer" }}>📁 파일</label>
        </label>
        <button onClick={onClose} style={{ ...tbFloatBtn, color: "#888" }}>✕</button>
      </div>
    );
  }
  return null;
}

interface EditHistory {
  past: SiteContent[];
  present: SiteContent;
  future: SiteContent[];
}

function WebsiteEditor({ content, customTheme, intake, selectedTemplateId, onTemplateChange, onSave, onNext, onBack }: {
  content: SiteContent;
  customTheme: CustomTheme;
  intake: IntakeData;
  selectedTemplateId: string;
  onTemplateChange: (id: string) => void;
  onSave: (c: SiteContent) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [history, setHistory] = useState<EditHistory>({ past: [], present: deepClone(content), future: [] });
  const [savedMsg, setSavedMsg] = useState(false);
  const [selectedEl, setSelectedEl] = useState<SelectedElInfo | null>(null);
  const [styleOverrides, setStyleOverrides] = useState<Record<string, Record<string, string>>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeRectRef = useRef<DOMRect | null>(null);

  const c = history.present;

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // iframe srcDoc with editMode: true
  const iframeSrcDoc = useMemo(() => {
    const tpl = getTemplateById(selectedTemplateId);
    return tpl.render({
      intake: { hospitalName: intake.hospitalName, phone: intake.phone, address: intake.address, specialties: intake.specialties },
      content: c,
      theme: { primary: customTheme.primary, accent: customTheme.accent, bg: customTheme.bg, textColor: customTheme.textColor },
      editMode: true,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, customTheme, selectedTemplateId, intake]);

  const sendToIframe = useCallback((msg: object) => {
    try { iframeRef.current?.contentWindow?.postMessage({ _wb: 1, ...msg }, "*"); } catch(e) {}
  }, []);

  // Re-apply styleOverrides after iframe reloads
  const handleIframeLoad = useCallback(() => {
    iframeRectRef.current = iframeRef.current?.getBoundingClientRect() ?? null;
    Object.entries(styleOverrides).forEach(([field, style]) => {
      sendToIframe({ type: "applyStyle", payload: { field, style } });
    });
  }, [styleOverrides, sendToIframe]);

  // postMessage listener
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data?._wb) return;
      const { type, payload } = e.data;
      if (type === "select") {
        iframeRectRef.current = iframeRef.current?.getBoundingClientRect() ?? null;
        setSelectedEl({ field: payload.field, editType: payload.editType, value: payload.value,
                        rect: payload.rect, computedStyle: payload.computedStyle });
      }
      if (type === "deselect") setSelectedEl(null);
      if (type === "change") {
        const { field, value } = payload;
        const next = deepClone(c);
        const parts = (field as string).split(".");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let obj: any = next;
        for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
        obj[parts[parts.length - 1]] = value;
        push(next);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);

  const applyStyle = useCallback((style: Record<string, string>) => {
    if (!selectedEl) return;
    const field = selectedEl.field;
    if (style.src !== undefined) {
      sendToIframe({ type: "setImg", payload: { field, src: style.src } });
    } else {
      sendToIframe({ type: "applyStyle", payload: { field, style } });
    }
    setStyleOverrides(prev => ({ ...prev, [field]: { ...(prev[field] || {}), ...style } }));
    setSelectedEl(prev => prev ? { ...prev, computedStyle: { ...prev.computedStyle, ...style as unknown as typeof prev.computedStyle } } : prev);
  }, [selectedEl, sendToIframe]);

  const push = (next: SiteContent) => {
    setHistory(h => ({ past: [...h.past.slice(-30), h.present], present: next, future: [] }));
    onSave(next);
  };

  const undo = () => setHistory(h => {
    if (!h.past.length) return h;
    const prev = h.past[h.past.length - 1];
    return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
  });

  const redo = () => setHistory(h => {
    if (!h.future.length) return h;
    const next = h.future[0];
    return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
  });

  const handleSave = () => { onSave(history.present); setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2000); };

  const handleOutsideClick = () => {
    if (selectedEl) { sendToIframe({ type: "deselect", payload: {} }); setSelectedEl(null); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: "#111" }}
      onClick={handleOutsideClick}>

      {/* ── 툴바 ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#1C1C1C", padding: "10px 20px", flexShrink: 0,
        borderBottom: "1px solid #333"
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={onBack} style={{ ...toolBtn, color: "#aaa" }} title="뒤로">
            <ArrowLeft size={15} />
          </button>
          <div style={{ width: 1, height: 20, background: "#444" }} />
          <button onClick={undo} disabled={!history.past.length}
            style={{ ...toolBtn, opacity: history.past.length ? 1 : 0.3 }} title="실행취소">
            <RotateCcw size={15} />
          </button>
          <button onClick={redo} disabled={!history.future.length}
            style={{ ...toolBtn, opacity: history.future.length ? 1 : 0.3 }} title="다시실행">
            <RotateCw size={15} />
          </button>
          <div style={{ width: 1, height: 20, background: "#444" }} />
          <Layout size={13} color="rgba(255,255,255,.4)" />
          {TEMPLATES.map(tpl => (
            <button key={tpl.id} onClick={() => onTemplateChange(tpl.id)} title={`${tpl.name} 템플릿`}
              style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                       cursor: "pointer", border: "none",
                       background: selectedTemplateId === tpl.id ? tpl.tagColor : "rgba(255,255,255,.1)",
                       color: "#fff", transition: "all .15s" }}>
              {tpl.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "rgba(255,255,255,.3)", fontSize: 11, marginRight: 4 }}>
            💡 클릭 → 스타일 편집 · 더블클릭 → 텍스트 직접 입력
          </span>
          {savedMsg && (
            <span style={{ color: "#4ade80", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <Check size={13} /> 저장됨
            </span>
          )}
          <button onClick={handleSave}
            style={{ background: "#155855", color: "#fff", border: "none", borderRadius: 8,
                     padding: "7px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
                     display: "flex", alignItems: "center", gap: 6 }}>
            <Save size={14} /> 저장
          </button>
          <button onClick={onNext}
            style={{ background: "#E85D2C", color: "#fff", border: "none", borderRadius: 8,
                     padding: "7px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
                     display: "flex", alignItems: "center", gap: 6 }}>
            완료 <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* ── iframe ── */}
      <iframe
        ref={iframeRef}
        srcDoc={iframeSrcDoc}
        onLoad={handleIframeLoad}
        onClick={e => e.stopPropagation()}
        style={{ flex: 1, border: "none", display: "block", width: "100%" }}
        title="홈페이지 편집"
        sandbox="allow-scripts allow-same-origin"
      />

      {/* ── FloatingToolbar ── */}
      {selectedEl && (
        <FloatingToolbar
          sel={selectedEl}
          iframeRect={iframeRectRef.current}
          onSendStyle={applyStyle}
          onClose={() => { sendToIframe({ type: "deselect", payload: {} }); setSelectedEl(null); }}
        />
      )}
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

function CompletionView({ intake, content, customTheme, selectedTemplateId, onNext, onBack }: {
  intake: IntakeData;
  content: SiteContent;
  customTheme: CustomTheme;
  selectedTemplateId: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  const generateHTML = () => {
    const tpl = getTemplateById(selectedTemplateId);
    return tpl.render({
      intake: { hospitalName: intake.hospitalName, phone: intake.phone, address: intake.address, specialties: intake.specialties },
      content,
      theme: { primary: customTheme.primary, accent: customTheme.accent, bg: customTheme.bg, textColor: customTheme.textColor },
    });
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

const SAVE_KEY = "wb_saved_projects";

interface SavedProject {
  id: string;
  name: string;
  savedAt: string;
  intake: IntakeData;
  designPrefs: DesignPrefs;
  customTheme: CustomTheme;
  content: SiteContent | null;
  step: Step;
  templateId?: string;
}

function loadSavedProjects(): SavedProject[] {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"); } catch { return []; }
}

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
  const [selectedTemplateId, setSelectedTemplateId] = useState("classic");

  // ── 저장/불러오기 ──
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    setSavedProjects(loadSavedProjects());
  }, [showLoadPanel]);

  const handleSaveProject = () => {
    const projects = loadSavedProjects();
    const newProject: SavedProject = {
      id: Date.now().toString(),
      name: intake.hospitalName || "이름 없음",
      savedAt: new Date().toLocaleString("ko-KR"),
      intake, designPrefs, customTheme, content, step, templateId: selectedTemplateId,
    };
    const updated = [newProject, ...projects].slice(0, 20); // 최대 20개
    localStorage.setItem(SAVE_KEY, JSON.stringify(updated));
    setSavedProjects(updated);
    setSaveMsg("저장됨!");
    setTimeout(() => setSaveMsg(""), 2000);
  };

  useSaveShortcut(handleSaveProject);

  const handleLoadProject = (project: SavedProject) => {
    setIntake(project.intake);
    setDesignPrefs(project.designPrefs);
    setCustomTheme(project.customTheme);
    setContent(project.content);
    setStep(project.step);
    if (project.templateId) setSelectedTemplateId(project.templateId);
    setShowLoadPanel(false);
  };

  const handleDeleteProject = (id: string) => {
    const updated = loadSavedProjects().filter(p => p.id !== id);
    localStorage.setItem(SAVE_KEY, JSON.stringify(updated));
    setSavedProjects(updated);
  };

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
      <PageHeader
        title="홈페이지 제작"
        backHref="/"
        backLabel="관리자 홈"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={handleSaveProject} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: saveMsg ? "#155855" : "#f0f7f5", color: saveMsg ? "#fff" : "#155855",
              border: "1.5px solid #c8ddd9", cursor: "pointer", transition: "all .2s"
            }}>
              <Save size={13} /> {saveMsg || "작업 저장"}
            </button>
            <button onClick={() => setShowLoadPanel(!showLoadPanel)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: showLoadPanel ? "#E85D2C" : "#fff",
              color: showLoadPanel ? "#fff" : "#555",
              border: "1.5px solid #e0dcd4", cursor: "pointer", transition: "all .2s"
            }}>
              <FileText size={13} /> 작업 불러오기 {savedProjects.length > 0 && `(${savedProjects.length})`}
            </button>
          </div>
        }
      />
      <section className="admin-dashboard" style={{ maxWidth: 900 }}>

        {/* ── 불러오기 패널 ── */}
        {showLoadPanel && (
          <div style={{
            background: "#fff", border: "1.5px solid #e5e0d8", borderRadius: 14,
            padding: "20px 24px", margin: "12px 0", boxShadow: "0 4px 20px rgba(0,0,0,.08)"
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: "#222" }}>
              📂 저장된 작업 불러오기
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
              최근 저장한 작업을 클릭하면 해당 상태로 바로 이동합니다.
            </div>
            {savedProjects.length === 0 ? (
              <div style={{ textAlign: "center", padding: "28px 0", color: "#aaa", fontSize: 13 }}>
                저장된 작업이 없습니다.<br />
                <span style={{ fontSize: 11 }}>상단 "작업 저장" 버튼으로 현재 진행상황을 저장하세요.</span>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {savedProjects.map((project) => (
                  <div key={project.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 16px", borderRadius: 10,
                    border: "1.5px solid #e8e3db", background: "#faf8f5",
                    transition: "all .15s"
                  }}>
                    {/* 컬러 미리보기 */}
                    <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      {[project.customTheme.primary, project.customTheme.accent, project.customTheme.bg].map((c, i) => (
                        <div key={i} style={{
                          width: 14, height: 32, borderRadius: 4, background: c,
                          border: "1px solid rgba(0,0,0,.1)"
                        }} />
                      ))}
                    </div>
                    {/* 정보 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#222", marginBottom: 3 }}>
                        {project.name}
                      </div>
                      <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#888", flexWrap: "wrap" }}>
                        <span>Step {project.step} · {STEP_LABELS[project.step - 1]}</span>
                        <span>·</span>
                        <span>{project.intake.specialties || "진료과 미입력"}</span>
                        <span>·</span>
                        <span>{project.savedAt}</span>
                      </div>
                      {project.content && (
                        <div style={{ fontSize: 11, color: "#155855", marginTop: 3 }}>
                          ✓ AI 생성 완료 · "{project.content.hero.headline}"
                        </div>
                      )}
                    </div>
                    {/* 액션 버튼 */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => handleLoadProject(project)} style={{
                        padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: "#155855", color: "#fff", border: "none", cursor: "pointer"
                      }}>
                        불러오기
                      </button>
                      <button onClick={() => handleDeleteProject(project.id)} style={{
                        padding: "7px 10px", borderRadius: 8, fontSize: 12,
                        background: "#fff", color: "#aaa", border: "1.5px solid #e0dcd4", cursor: "pointer"
                      }}>
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                selectedTemplateId={selectedTemplateId}
                onTemplateChange={setSelectedTemplateId}
                onNext={() => setStep(3)}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && content && (
              <WebsiteEditor
                content={content}
                customTheme={customTheme}
                intake={intake}
                selectedTemplateId={selectedTemplateId}
                onTemplateChange={setSelectedTemplateId}
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
                selectedTemplateId={selectedTemplateId}
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

