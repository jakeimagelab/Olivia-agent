"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Check, Globe2, Pencil, Download,
  RotateCcw, RotateCw, Save, Eye, ImageIcon, Type, Palette,
  ChevronRight, Loader2, Phone, MapPin, Clock, Star,
  Building2, User2, FileText, Upload, CheckCircle2, AlertCircle
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

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS = ["고객 접수", "디자인 선택", "편집", "제작 완료", "배포"];

const PAGE_OPTIONS = [
  "메인", "병원 소개", "의료진", "진료항목", "예약", "오시는길", "커뮤니티", "이벤트"
];

const SPECIALTIES_LIST = [
  "내과", "소아청소년과", "이비인후과", "피부과", "정형외과", "신경외과",
  "마취통증의학과", "재활의학과", "성형외과", "안과", "치과", "산부인과",
  "비뇨기과", "외과", "정신건강의학과", "한방병원"
];

const COLOR_THEMES = {
  green: {
    label: "그린 클린",
    desc: "신뢰감 · 안정 · 자연",
    primary: "#155855",
    accent: "#E85D2C",
    bg: "#faf7f2",
    preview: "linear-gradient(135deg, #155855 0%, #1C3F3C 100%)"
  },
  blue: {
    label: "블루 프레시",
    desc: "전문성 · 청결 · 첨단",
    primary: "#1a5f9e",
    accent: "#0ea5e9",
    bg: "#f0f7ff",
    preview: "linear-gradient(135deg, #1a5f9e 0%, #0369a1 100%)"
  },
  dark: {
    label: "다크 프리미엄",
    desc: "고급감 · 럭셔리 · 신뢰",
    primary: "#1a1a2e",
    accent: "#d4a843",
    bg: "#f8f8f6",
    preview: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
  }
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

function DesignPicker({ intake, onGenerate, isGenerating, content, selectedTheme, onThemeChange, onNext, onBack }: {
  intake: IntakeData;
  onGenerate: () => void;
  isGenerating: boolean;
  content: SiteContent | null;
  selectedTheme: "green" | "blue" | "dark";
  onThemeChange: (t: "green" | "blue" | "dark") => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: "#222" }}>
        홈페이지 디자인
      </h2>
      <p style={{ color: "#666", marginBottom: 28, fontSize: 14 }}>
        AI가 병원 정보를 분석해 콘텐츠를 생성하고, 컬러 테마를 선택합니다.
      </p>

      {/* AI Generate Button */}
      <div style={{
        background: "linear-gradient(135deg, #155855 0%, #1C3F3C 100%)",
        borderRadius: 16, padding: "24px 28px", marginBottom: 28,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20
      }}>
        <div>
          <div style={{ color: "rgba(255,255,255,.6)", fontSize: 12, marginBottom: 6 }}>
            AI 콘텐츠 자동 생성
          </div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>
            {intake.hospitalName} 홈페이지 콘텐츠 만들기
          </div>
          <div style={{ color: "rgba(255,255,255,.5)", fontSize: 13, marginTop: 4 }}>
            헤드라인, 소개문, 진료항목, 공지사항 등을 자동 작성합니다
          </div>
        </div>
        <button onClick={onGenerate} disabled={isGenerating}
          style={{
            background: "#E85D2C", color: "#fff", border: "none",
            borderRadius: 10, padding: "12px 24px", fontWeight: 700,
            fontSize: 14, cursor: isGenerating ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
            opacity: isGenerating ? 0.7 : 1
          }}>
          {isGenerating ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> 생성 중...</> : "✨ AI 생성"}
        </button>
      </div>

      {/* Color Theme Picker */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: "#444" }}>컬러 테마 선택</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {(Object.entries(COLOR_THEMES) as [string, typeof COLOR_THEMES.green][]).map(([key, theme]) => (
            <button key={key}
              onClick={() => onThemeChange(key as "green" | "blue" | "dark")}
              style={{
                border: selectedTheme === key ? "2px solid #E85D2C" : "2px solid #e5e0d8",
                borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "#fff",
                transition: "all .2s", textAlign: "left"
              }}>
              <div style={{ height: 60, background: theme.preview }} />
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{theme.label}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{theme.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content Preview */}
      {content && (
        <div style={{
          background: "#f8f7f4", borderRadius: 12, padding: "20px 24px",
          border: "1px solid #e5e0d8", marginBottom: 24
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, color: "#333",
                        display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} color="#155855" />
            AI 생성 콘텐츠 미리보기
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <PreviewRow label="헤드라인" value={content.hero.headline} />
            <PreviewRow label="소개 제목" value={content.about.title} />
            <PreviewRow label="진료항목" value={content.services.map(s => s.name).join(" · ")} />
            <PreviewRow label="컬러 테마" value={COLOR_THEMES[content.colorTheme]?.label || content.colorTheme} />
            <PreviewRow label="SEO 키워드" value={content.keywords?.join(", ")} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
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

// ─── Step 3: Visual Editor ────────────────────────────────────────────────────

interface EditHistory {
  past: SiteContent[];
  present: SiteContent;
  future: SiteContent[];
}

function WebsiteEditor({ content, theme, intake, onSave, onNext, onBack }: {
  content: SiteContent;
  theme: "green" | "blue" | "dark";
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
  const t = COLOR_THEMES[theme];

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

function CompletionView({ intake, content, theme, onNext, onBack }: {
  intake: IntakeData;
  content: SiteContent;
  theme: "green" | "blue" | "dark";
  onNext: () => void;
  onBack: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  const generateHTML = () => {
    const t = COLOR_THEMES[theme];
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
          <div style={badgeStyle}><Palette size={12} /> {COLOR_THEMES[theme].label}</div>
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
  const [selectedTheme, setSelectedTheme] = useState<"green" | "blue" | "dark">("green");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/website-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intake)
      });
      const data = await res.json();
      if (data.content) {
        setContent(data.content);
        if (data.content.colorTheme) setSelectedTheme(data.content.colorTheme);
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
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                content={content}
                selectedTheme={selectedTheme}
                onThemeChange={setSelectedTheme}
                onNext={() => setStep(3)}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && content && (
              <WebsiteEditor
                content={content}
                theme={selectedTheme}
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
                theme={selectedTheme}
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
