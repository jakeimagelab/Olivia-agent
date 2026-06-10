"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import OliviaChat from "@/components/OliviaChat";
import PageHeader from "@/components/PageHeader";
import {
  ArrowLeft, CheckSquare, ChevronDown, ClipboardList,
  Clock, Download, FileSpreadsheet, FileText, GripVertical,
  Pencil, Plus, RotateCcw, Sparkles, Trash2, X, Zap
} from "lucide-react";

/* ════════════════════════════════════════
   프리셋
════════════════════════════════════════ */
// ※ 진료과 순서: PDF 콘티 기준 / 실제 촬영 빈도 순
const SPECIALTY_OPTIONS = [
  // 소아·이비인후
  "소아청소년과", "이비인후과(청각치료포함)",
  // 내과·검진
  "검진내과",
  // 근골격·통증계 (C-ARM / 초음파주사 / 통증치료 공통)
  "정형외과", "신경외과", "마취통증의학과", "재활의학과",
  // 미용·외모
  "성형외과", "피부과",
  // 기타 전문과
  "안과", "치과", "산부인과", "비뇨기과", "외과",
  // 정신·한방
  "정신건강의학과", "한방병원(한의원)",
];
const STAFF_ROLE_PRESETS = [
  "간호사", "수간호사", "병동 간호사", "외래 간호사",
  "인포데스크 직원", "상담실장", "수술팀 직원",
  "영양사", "방사선사", "물리치료사", "행정직원"
];
const PATIENT_TYPE_PRESETS = [
  "아이 (유아, 만 1~3세)", "아이 (소아, 만 4~7세)", "아이 (초등, 만 8~13세)",
  "부모 + 아이 그룹", "성인 남성", "성인 여성", "노인 (60대 이상)"
];

/* ════════════════════════════════════════
   타입
════════════════════════════════════════ */
interface StaffItem    { role: string; count: number; detail: string; }
interface PatientItem  { type: string; count: number; detail: string; }
interface LocationItem { floor: string; spaces: string; notes: string; }
interface ContiRow     { category: string; duration: string; location: string; cameraAngle: string; keyword: string; description: string; personnel: string; notes: string; color?: string; }
interface ChecklistRow { number: number; category: string; item: string; notes: string; }
interface ScheduleRow  { time: string; duration?: string; activity: string; type: string; requirements: string; notes: string; }
interface ContiResult  { conti: ContiRow[]; checklist: ChecklistRow[]; schedule: ScheduleRow[]; }

/* ════════════════════════════════════════
   색상
════════════════════════════════════════ */
const CAT_COLORS = [
  { key: "하모니",       bg: "#FEF3C7", text: "#92400E" },
  { key: "공통",         bg: "#FEF3C7", text: "#92400E" },
  { key: "인포데스크",   bg: "#FEF3C7", text: "#92400E" },
  { key: "C-ARM",        bg: "#FEE2E2", text: "#991B1B" },
  { key: "씨암",         bg: "#FEE2E2", text: "#991B1B" },
  { key: "시술",         bg: "#FEE2E2", text: "#991B1B" },
  { key: "초음파",       bg: "#DBEAFE", text: "#1E40AF" },
  { key: "주사",         bg: "#DBEAFE", text: "#1E40AF" },
  { key: "외래",         bg: "#FCE7F3", text: "#9D174D" },
  { key: "진료",         bg: "#FCE7F3", text: "#9D174D" },
  { key: "상담",         bg: "#FCE7F3", text: "#9D174D" },
  { key: "병동",         bg: "#EDE9FE", text: "#5B21B6" },
  { key: "재활",         bg: "#D1FAE5", text: "#065F46" },
  { key: "물리치료",     bg: "#D1FAE5", text: "#065F46" },
  { key: "인테리어",     bg: "#F3F4F6", text: "#374151" },
  { key: "수술",         bg: "#FEE2E2", text: "#991B1B" },
];
const getColor = (cat: string) =>
  CAT_COLORS.find(c => cat.includes(c.key)) ?? { bg: "#E6F4F1", text: "#155855" };

const TH: React.CSSProperties = {
  background: "#155855", color: "#fff", padding: "10px 12px",
  fontWeight: 900, fontSize: 12, textAlign: "left",
  whiteSpace: "nowrap", borderRight: "1px solid rgba(255,255,255,0.12)"
};
const TD: React.CSSProperties = {
  padding: "6px 8px", fontSize: 13, color: "#374151",
  borderBottom: "1px solid rgba(21,88,85,0.07)",
  verticalAlign: "top"
};

/* ════════════════════════════════════════
   인라인 편집 셀
════════════════════════════════════════ */
function EditableCell({
  value, onChange, multiline = false, placeholder = "클릭하여 편집", bold = false, color
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  bold?: boolean;
  color?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => { onChange(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  const base: React.CSSProperties = {
    width: "100%", fontSize: 13, lineHeight: 1.6,
    border: "1.5px solid #155855", borderRadius: 4,
    padding: "4px 6px", background: "#fffef9", outline: "none",
    fontWeight: bold ? 900 : 400, color: color ?? "#374151",
    boxShadow: "0 0 0 3px rgba(21,88,85,0.12)",
  };

  if (editing) {
    return multiline ? (
      <textarea autoFocus value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Escape") cancel(); }}
        style={{ ...base, minHeight: 72, resize: "vertical" }}
      />
    ) : (
      <input autoFocus value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
        style={{ ...base, minHeight: 28 }}
      />
    );
  }

  return (
    <div
      onClick={() => { setDraft(value); setEditing(true); }}
      title="✏️ 클릭하여 편집"
      style={{
        cursor: "text", minHeight: 24, padding: "3px 4px",
        borderRadius: 4, lineHeight: 1.6,
        fontWeight: bold ? 900 : 400, color: color ?? "#374151",
        transition: "all 100ms ease",
        whiteSpace: multiline ? "pre-line" : undefined,
        position: "relative", border: "1px solid transparent",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.background = "rgba(21,88,85,0.06)";
        el.style.border = "1px dashed rgba(21,88,85,0.35)";
        el.style.borderRadius = "4px";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.background = "transparent";
        el.style.border = "1px solid transparent";
      }}
    >
      {value || <span style={{ color: "#bbb", fontStyle: "italic", fontWeight: 400 }}>{placeholder}</span>}
    </div>
  );
}

/* ════════════════════════════════════════
   삭제 버튼
════════════════════════════════════════ */
function DeleteRowBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="행 삭제" style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, border: "1px solid #fee2e2",
      borderRadius: 4, background: "#fff", color: "#ef4444",
      cursor: "pointer", flexShrink: 0, opacity: 0.7,
      transition: "opacity 120ms"
    }}
      onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
    >
      <Trash2 size={12} />
    </button>
  );
}

/* ════════════════════════════════════════
   드래그 핸들
════════════════════════════════════════ */
/* ════════════════════════════════════════
   시간 선택 셀
════════════════════════════════════════ */
const TIME_OPTIONS: string[] = [];
for (let h = 8; h <= 20; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2,"0")}:00`);
  TIME_OPTIONS.push(`${String(h).padStart(2,"0")}:30`);
}

const DURATION_OPTIONS = ["10분","15분","20분","30분","45분","60분","90분","120분"];

function parseMins(t: string): number {
  const m = t.match(/(\d+):(\d+)/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
}
function addMins(t: string, mins: number): string {
  const total = parseMins(t) + mins;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function durationToMins(d: string): number {
  const m = d.match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

function TimePickerCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // "HH:MM - HH:MM" 형식에서 시작 시간만 추출
  const startTime = value.match(/(\d{2}:\d{2})/)?.[1] || "";

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const select = (t: string) => {
    // 기존 종료시간 유지하면서 시작시간만 교체
    const endMatch = value.match(/- (\d{2}:\d{2})/);
    onChange(endMatch ? `${t} - ${endMatch[1]}` : t);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          cursor: "pointer", fontWeight: 700, color: "#155855", fontSize: 13,
          padding: "3px 6px", borderRadius: 6, minWidth: 90,
          background: open ? "rgba(21,88,85,0.08)" : "transparent",
          border: "1px solid " + (open ? "#155855" : "transparent"),
          transition: "all 120ms", whiteSpace: "nowrap"
        }}
        title="시작 시간 선택"
      >
        {value || <span style={{ color: "#bbb", fontStyle: "italic", fontWeight: 400 }}>시간 선택</span>}
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          background: "#fff", border: "1px solid rgba(21,88,85,0.2)",
          borderRadius: 10, boxShadow: "0 8px 28px rgba(21,88,85,0.18)",
          padding: 6, maxHeight: 220, overflowY: "auto", minWidth: 100,
        }}>
          {TIME_OPTIONS.map(t => (
            <div key={t} onClick={() => select(t)} style={{
              padding: "7px 14px", fontSize: 13, fontWeight: startTime === t ? 900 : 500,
              color: startTime === t ? "#155855" : "#374151",
              background: startTime === t ? "rgba(21,88,85,0.08)" : "transparent",
              borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap"
            }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(21,88,85,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = startTime === t ? "rgba(21,88,85,0.08)" : "transparent")}
            >{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function DurationPickerCell({ timeValue, onTimeChange }: {
  timeValue: string;
  onTimeChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 현재 소요시간 계산 (시작~종료 차이)
  const times = timeValue.match(/(\d{2}:\d{2})/g);
  const currentMins = times && times.length >= 2 ? parseMins(times[1]) - parseMins(times[0]) : 0;
  const currentLabel = currentMins > 0 ? `${currentMins}분` : "";

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const select = (d: string) => {
    const mins = durationToMins(d);
    const startMatch = timeValue.match(/(\d{2}:\d{2})/);
    if (startMatch) {
      const end = addMins(startMatch[1], mins);
      onTimeChange(`${startMatch[1]} - ${end}`);
    }
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          cursor: "pointer", fontSize: 12, fontWeight: 700,
          color: currentLabel ? "#E85D2C" : "#bbb",
          padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap",
          background: open ? "rgba(232,93,44,0.08)" : "rgba(232,93,44,0.06)",
          border: "1px solid " + (open ? "#E85D2C" : "rgba(232,93,44,0.2)"),
          transition: "all 120ms", display: "inline-block"
        }}
        title="소요시간 선택 → 종료시간 자동 계산"
      >
        {currentLabel || "소요시간"}
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          background: "#fff", border: "1px solid rgba(21,88,85,0.2)",
          borderRadius: 10, boxShadow: "0 8px 28px rgba(21,88,85,0.18)",
          padding: 6, minWidth: 90,
        }}>
          {DURATION_OPTIONS.map(d => (
            <div key={d} onClick={() => select(d)} style={{
              padding: "7px 14px", fontSize: 13, fontWeight: currentLabel === d ? 900 : 500,
              color: currentLabel === d ? "#E85D2C" : "#374151",
              background: currentLabel === d ? "rgba(232,93,44,0.08)" : "transparent",
              borderRadius: 6, cursor: "pointer"
            }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(232,93,44,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = currentLabel === d ? "rgba(232,93,44,0.08)" : "transparent")}
            >{d}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function DragHandle() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, cursor: "grab", color: "rgba(21,88,85,0.35)",
      borderRadius: 4, flexShrink: 0, transition: "color 120ms",
    }}
      onMouseEnter={e => (e.currentTarget.style.color = "rgba(21,88,85,0.8)")}
      onMouseLeave={e => (e.currentTarget.style.color = "rgba(21,88,85,0.35)")}
    >
      <GripVertical size={16} />
    </div>
  );
}


/* ════════════════════════════════════════
   행 색상 팔레트
════════════════════════════════════════ */
const ROW_PALETTE = [
  { bg: "#FEF3C7", text: "#92400E", label: "노랑" },
  { bg: "#FEE2E2", text: "#991B1B", label: "빨강" },
  { bg: "#DBEAFE", text: "#1E40AF", label: "파랑" },
  { bg: "#D1FAE5", text: "#065F46", label: "초록" },
  { bg: "#EDE9FE", text: "#5B21B6", label: "보라" },
  { bg: "#FCE7F3", text: "#9D174D", label: "분홍" },
  { bg: "#E6F4F1", text: "#155855", label: "민트" },
  { bg: "#F3F4F6", text: "#374151", label: "회색" },
  { bg: "#FFF7ED", text: "#C2410C", label: "주황" },
  { bg: "#ffffff", text: "#374151", label: "흰색" },
];

function ColorPickerCell({ bg, text, onChange }: {
  bg: string; text: string; onChange: (bg: string, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        title="행 색상 변경"
        onClick={() => setOpen(o => !o)}
        style={{
          width: 18, height: 18, borderRadius: "50%",
          background: bg, border: `2px solid ${text}`,
          cursor: "pointer", display: "block",
          boxShadow: open ? `0 0 0 2px ${text}` : "none",
          transition: "box-shadow 120ms"
        }}
      />
      {open && (
        <div style={{
          position: "absolute", top: 24, left: 0, zIndex: 100,
          background: "#fff", border: "1px solid rgba(21,88,85,0.18)",
          borderRadius: 10, boxShadow: "0 8px 28px rgba(21,88,85,0.18)",
          padding: 10, display: "grid", gridTemplateColumns: "repeat(5, 28px)", gap: 6,
        }}>
          {ROW_PALETTE.map(p => (
            <button
              key={p.bg}
              type="button"
              title={p.label}
              onClick={() => { onChange(p.bg, p.text); setOpen(false); }}
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: p.bg, border: `2px solid ${p.text}`,
                cursor: "pointer",
                boxShadow: bg === p.bg ? `0 0 0 2px #155855` : "none",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}


function SpecialtyPicker({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen]     = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = (s: string) =>
    onChange(selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s]);

  const addCustom = () => {
    const v = custom.trim();
    if (v && !selected.includes(v)) onChange([...selected, v]);
    setCustom("");
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", minHeight: 44, padding: "6px 12px",
        border: `1px solid ${open ? "var(--deep-green)" : "#d8d0c4"}`,
        borderRadius: 8, background: "#fffdfa", cursor: "pointer", textAlign: "left",
        boxShadow: open ? "0 0 0 3px rgba(21,88,85,0.12)" : "none",
        transition: "all 160ms ease"
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1, minHeight: 24 }}>
          {selected.length === 0
            ? <span style={{ color: "#9ca3af", fontSize: 14 }}>진료과를 선택하세요 (복수 선택 가능)</span>
            : selected.map(s => (
              <span key={s} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "var(--deep-green)", color: "#fff",
                fontSize: 12, fontWeight: 800, padding: "2px 8px", borderRadius: 99
              }}>
                {s}
                <X size={11} onClick={e => { e.stopPropagation(); toggle(s); }} style={{ cursor: "pointer" }} />
              </span>
            ))
          }
        </div>
        <ChevronDown size={16} style={{ color: "#6b7280", flexShrink: 0, marginLeft: 8, transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
          background: "#fff", border: "1px solid rgba(21,88,85,0.2)",
          borderRadius: 10, boxShadow: "0 16px 40px rgba(21,88,85,0.14)", padding: 14
        }}>
          <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 800, color: "#9ca3af" }}>클릭하여 선택 / 해제</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {SPECIALTY_OPTIONS.map(s => (
              <button key={s} type="button" onClick={() => toggle(s)} style={{
                padding: "5px 12px", borderRadius: 99, fontSize: 13, fontWeight: 700, cursor: "pointer",
                transition: "all 120ms ease",
                border: selected.includes(s) ? "1.5px solid var(--deep-green)" : "1.5px solid #e5e7eb",
                background: selected.includes(s) ? "var(--deep-green)" : "#f9fafb",
                color: selected.includes(s) ? "#fff" : "#374151"
              }}>{s}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>
            <input value={custom} onChange={e => setCustom(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              placeholder="목록에 없는 진료과 직접 입력"
              style={{ flex: 1, minHeight: 34, fontSize: 13 }} />
            <button type="button" onClick={addCustom} style={{
              padding: "0 14px", background: "var(--deep-green)", color: "#fff",
              border: "none", borderRadius: 6, fontWeight: 800, fontSize: 13, cursor: "pointer"
            }}>추가</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   섹션 박스
════════════════════════════════════════ */
function SectionBox({ emoji, title, desc, children }: {
  emoji: string; title: string; desc?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(21,88,85,0.12)", borderRadius: 10, padding: 24 }}>
      <h3 style={{ margin: "0 0 4px", color: "#155855", fontSize: 15, fontWeight: 900 }}>{emoji} {title}</h3>
      {desc && <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 13 }}>{desc}</p>}
      {!desc && <div style={{ height: 14 }} />}
      {children}
    </div>
  );
}

function ColHeaders({ cols, extra = true }: { cols: string[]; extra?: boolean }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `${cols.map(() => "1fr").join(" ")}${extra ? " 36px" : ""}`,
      gap: 8, marginBottom: 6, padding: "0 2px"
    }}>
      {[...cols, ...(extra ? [""] : [])].map((h, i) => (
        <span key={i} style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af" }}>{h}</span>
      ))}
    </div>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 36, height: 36, border: "1px solid #fee2e2",
      borderRadius: 6, background: "#fff", color: "#ef4444", cursor: "pointer", flexShrink: 0
    }}>
      <Trash2 size={14} />
    </button>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10,
      padding: "6px 14px", border: "1px solid rgba(21,88,85,0.25)",
      borderRadius: 6, background: "#fff", color: "#155855",
      fontSize: 13, fontWeight: 800, cursor: "pointer"
    }}>
      <Plus size={14} /> {label}
    </button>
  );
}

function EmptyRow() {
  return (
    <div style={{ padding: 14, border: "1px dashed #d7cec1", borderRadius: 8, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
      항목을 추가해주세요
    </div>
  );
}

/* ════════════════════════════════════════
   메인
════════════════════════════════════════ */
export default function ContiPage() {
  const [form, setForm] = useState({
    hospitalName:  "",
    specialties:   [] as string[],
    doctors:       "1",
    viceDirectors: "0",
    staffItems:    [{ role: "", count: 1, detail: "" }] as StaffItem[],
    patientItems:  [{ type: "", count: 1, detail: "" }] as PatientItem[],
    locationItems: [{ floor: "", spaces: "", notes: "" }] as LocationItem[],
    purpose: "",
    notes:   ""
  });

  const [loading,          setLoading]          = useState(false);

  // URL 파라미터로 자동 입력 (올리비아 에이전트 연동)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params       = new URLSearchParams(window.location.search);
    const hospitalName = params.get("hospitalName");
    const dept         = params.get("dept");
    const spaces       = params.get("spaces");
    const doctors      = params.get("doctors");
    const extras       = params.get("extras");

    if (hospitalName || dept) {
      setForm(prev => ({
        ...prev,
        hospitalName: hospitalName || prev.hospitalName,
        specialties:  dept ? [dept] : prev.specialties,
        doctors:      doctors || prev.doctors,
        notes:        extras || prev.notes,
        locationItems: spaces
          ? [{ floor: "", spaces: spaces, notes: "" }]
          : prev.locationItems,
      }));
    }
  }, []);
  const [result,           setResult]           = useState<ContiResult | null>(null);
  const [error,            setError]            = useState("");
  const [tab,              setTab]              = useState<"conti" | "checklist" | "schedule">("conti");
  const [fieldView,        setFieldView]        = useState(false); // 아이패드 현장 뷰
  const [resultTitle,      setResultTitle]      = useState("");
  const [quickSpecialties, setQuickSpecialties] = useState<string[]>([]);
  const [quickLoading,     setQuickLoading]     = useState(false);
  const [quickError,       setQuickError]       = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const set = (field: string, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }));

  /* ── 결과 셀 수정 ── */
  const updateConti = (i: number, field: keyof ContiRow, v: string) =>
    setResult(prev => {
      if (!prev) return prev;
      const rows = [...prev.conti];
      rows[i] = { ...rows[i], [field]: v };
      return { ...prev, conti: rows };
    });

  const updateContiColor = (i: number, bg: string, text: string) =>
    setResult(prev => {
      if (!prev) return prev;
      const rows = [...prev.conti];
      rows[i] = { ...rows[i], color: `${bg}|${text}` };
      return { ...prev, conti: rows };
    });

  const updateChecklist = (i: number, field: keyof ChecklistRow, v: string) =>
    setResult(prev => {
      if (!prev) return prev;
      const rows = [...prev.checklist];
      rows[i] = { ...rows[i], [field]: v };
      return { ...prev, checklist: rows };
    });

  const updateSchedule = (i: number, field: keyof ScheduleRow, v: string) =>
    setResult(prev => {
      if (!prev) return prev;
      const rows = [...prev.schedule];
      rows[i] = { ...rows[i], [field]: v };
      return { ...prev, schedule: rows };
    });

  /* ── 결과 행 추가/삭제 ── */
  const addContiRow = () => setResult(prev => prev ? {
    ...prev, conti: [...prev.conti, { category: "", duration: "", location: "", cameraAngle: "", keyword: "", description: "", personnel: "", notes: "" }]
  } : prev);

  const delContiRow = (i: number) => setResult(prev => prev ? { ...prev, conti: prev.conti.filter((_, idx) => idx !== i) } : prev);

  const moveContiRow = (from: number, to: number) => setResult(prev => {
    if (!prev) return prev;
    const rows = [...prev.conti];
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    return { ...prev, conti: rows };
  });

  const moveChecklistRow = (from: number, to: number) => setResult(prev => {
    if (!prev) return prev;
    const rows = [...prev.checklist];
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    return { ...prev, checklist: rows.map((r, idx) => ({ ...r, number: idx + 1 })) };
  });

  const moveScheduleRow = (from: number, to: number) => setResult(prev => {
    if (!prev) return prev;
    const rows = [...prev.schedule];
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    return { ...prev, schedule: rows };
  });

  const dragRef = useRef<{ type: string; index: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ type: string; index: number } | null>(null);

  const handleDragStart = (type: string, index: number) => {
    dragRef.current = { type, index };
  };
  const handleDragOver = (e: React.DragEvent, type: string, index: number) => {
    e.preventDefault();
    setDragOver({ type, index });
  };
  const handleDrop = (type: string, toIndex: number) => {
    if (!dragRef.current || dragRef.current.type !== type) return;
    const from = dragRef.current.index;
    if (from === toIndex) { setDragOver(null); return; }
    if (type === "conti")     moveContiRow(from, toIndex);
    if (type === "checklist") moveChecklistRow(from, toIndex);
    if (type === "schedule")  moveScheduleRow(from, toIndex);
    dragRef.current = null;
    setDragOver(null);
  };
  const handleDragEnd = () => { dragRef.current = null; setDragOver(null); };

  const addChecklistRow = () => setResult(prev => {
    if (!prev) return prev;
    const number = prev.checklist.length + 1;
    return { ...prev, checklist: [...prev.checklist, { number, category: "", item: "", notes: "" }] };
  });

  const delChecklistRow = (i: number) => setResult(prev => prev ? {
    ...prev, checklist: prev.checklist.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, number: idx + 1 }))
  } : prev);

  const addScheduleRow = () => setResult(prev => prev ? {
    ...prev, schedule: [...prev.schedule, { time: "", activity: "", type: "", requirements: "", notes: "" }]
  } : prev);

  const delScheduleRow = (i: number) => setResult(prev => prev ? { ...prev, schedule: prev.schedule.filter((_, idx) => idx !== i) } : prev);

  /* ── 직원/환자/장소 수정 ── */
  const updateStaff    = (i: number, patch: Partial<StaffItem>)    => { const n = [...form.staffItems];    n[i] = { ...n[i], ...patch }; set("staffItems", n); };
  const updatePatient  = (i: number, patch: Partial<PatientItem>)  => { const n = [...form.patientItems];  n[i] = { ...n[i], ...patch }; set("patientItems", n); };
  const updateLocation = (i: number, patch: Partial<LocationItem>) => { const n = [...form.locationItems]; n[i] = { ...n[i], ...patch }; set("locationItems", n); };

  /* ── ⚡ 빠른 콘티 생성 ── */
  const handleQuickGenerate = async () => {
    if (quickSpecialties.length === 0) { setQuickError("진료과목을 선택해주세요."); return; }
    setQuickLoading(true); setQuickError(""); setResult(null);
    try {
      const res  = await fetch("/api/conti", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quick: true, specialties: quickSpecialties.join(", ") })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "오류가 발생했습니다.");
      setResult(data);
      setResultTitle(quickSpecialties.join(" · ") + " — 기본 콘티");
      setForm(prev => ({ ...prev, specialties: quickSpecialties }));
      setTab("conti");
    } catch (err: unknown) {
      setQuickError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally { setQuickLoading(false); }
  };

  /* ── 상세 생성 ── */
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.specialties.length === 0) { setError("진료과목을 1개 이상 선택해주세요."); return; }
    setLoading(true); setError(""); setResult(null);

    const staffDesc    = form.staffItems.filter(s => s.role).map(s => `${s.role} ${s.count}명${s.detail ? ` (${s.detail})` : ""}`).join(", ") || "미입력";
    const patientDesc  = form.patientItems.filter(p => p.type).map(p => `${p.type} ${p.count}명${p.detail ? ` (${p.detail})` : ""}`).join(", ") || "미입력";
    const locationDesc = form.locationItems.filter(l => l.floor || l.spaces).map(l => `${l.floor ? l.floor + " " : ""}${l.spaces}${l.notes ? ` (${l.notes})` : ""}`).join(" / ") || "미입력";

    try {
      const res  = await fetch("/api/conti", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospitalName: form.hospitalName, specialties: form.specialties.join(", "), doctors: form.doctors, viceDirectors: form.viceDirectors, staff: staffDesc, patients: patientDesc, locations: locationDesc, purpose: form.purpose, notes: form.notes })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "오류가 발생했습니다.");
      setResult(data);
      setResultTitle(form.hospitalName || form.specialties.join(" · "));
      setTab("conti");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally { setLoading(false); }
  };

  /* ── localStorage 저장 ── */
  const STORAGE_KEY = "photoclinic_contis";

  const getSavedContis = (): Array<{ id: string; savedAt: string; hospitalName: string; title: string; result: ContiResult; specialties: string[] }> => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  };

  const handleSaveJSON = () => {
    if (!result) return;
    const saved = getSavedContis();
    const id = `conti_${Date.now()}`;
    const entry = {
      id,
      savedAt: new Date().toISOString(),
      hospitalName: form.hospitalName || "병원명 없음",
      specialties: form.specialties,
      title: resultTitle,
      result,
    };
    // 같은 병원명이 있으면 덮어쓰기
    const existingIdx = saved.findIndex(s => s.hospitalName === entry.hospitalName);
    if (existingIdx >= 0) saved[existingIdx] = entry;
    else saved.unshift(entry);
    // 최대 5개 보관
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 5)));
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  /* ── localStorage 불러오기 ── */
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [savedList, setSavedList]         = useState<ReturnType<typeof getSavedContis>>([]);
  const [saveToast, setSaveToast]         = useState(false);

  const openLoadPanel = () => {
    setSavedList(getSavedContis());
    setShowLoadPanel(true);
  };

  const loadConti = (entry: ReturnType<typeof getSavedContis>[0]) => {
    setResult(entry.result);
    setResultTitle(entry.title || entry.hospitalName);
    setForm(prev => ({ ...prev, hospitalName: entry.hospitalName, specialties: entry.specialties || prev.specialties }));
    setTab("conti");
    setShowLoadPanel(false);
  };

  const deleteConti = (id: string) => {
    const updated = getSavedContis().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSavedList(updated);
  };


  /* ── PDF 인쇄 (브라우저 print, 한글 완벽 지원, 3섹션 1파일) ── */
  const handlePDF = () => {
    if (!result) return;
    const hospitalName = form.hospitalName || "병원";
    const today = new Date().toLocaleDateString("ko-KR", { year:"numeric", month:"long", day:"numeric" });
    const specialties = form.specialties.join(" · ");

    const CAT_BG: Record<string,string> = {
      "하모니":"#FEF3C7","공통":"#FEF3C7","인포데스크":"#FEF3C7",
      "치과":"#D1FAE5","교정":"#D1FAE5",
      "상담":"#FCE7F3","진료":"#FCE7F3",
      "C-ARM":"#FEE2E2","씨암":"#FEE2E2","시술":"#FEE2E2","수술":"#FEE2E2",
      "초음파":"#DBEAFE","주사":"#DBEAFE",
      "재활":"#D1FAE5","물리치료":"#D1FAE5",
      "인테리어":"#F3F4F6",
    };
    const CAT_FG: Record<string,string> = {
      "하모니":"#92400E","공통":"#92400E","인포데스크":"#92400E",
      "치과":"#065F46","교정":"#065F46",
      "상담":"#9D174D","진료":"#9D174D",
      "C-ARM":"#991B1B","씨암":"#991B1B","시술":"#991B1B","수술":"#991B1B",
      "초음파":"#1E40AF","주사":"#1E40AF",
      "재활":"#065F46","물리치료":"#065F46",
      "인테리어":"#374151",
    };
    const getCatBg = (cat: string) => CAT_BG[Object.keys(CAT_BG).find(k=>cat.includes(k))||""]||"#E6F4F1";
    const getCatFg = (cat: string) => CAT_FG[Object.keys(CAT_FG).find(k=>cat.includes(k))||""]||"#155855";

    const shootDate = form.hospitalName ? "" : "";  // 촬영일자는 resultTitle에서 추출하거나 빈값
    const header = (title: string, isFirst = false) => `
      <div class="page-header">
        <div class="brand">
          <span class="brand-name">PHOTO CLINIC</span>
          <span class="brand-sub">병원 브랜딩 포토그래피</span>
        </div>
        <div class="doc-info">
          <div class="doc-title">${hospitalName}</div>
          <div class="doc-section">${title}</div>
        </div>
        <div class="doc-date">${today}</div>
      </div>
      <div class="orange-bar"></div>
    `;

    const contiRows = result.conti.map((r,i) => `
      <tr>
        <td style="background:${getCatBg(r.category)};color:${getCatFg(r.category)};font-weight:900;text-align:center" contenteditable="true">${r.category}</td>
        <td style="text-align:center" contenteditable="true">${r.duration||"-"}</td>
        <td style="text-align:center" contenteditable="true">${r.location||"-"}</td>
        <td style="font-size:7pt;color:#4b5563;line-height:1.5" contenteditable="true">${r.cameraAngle||"-"}</td>
        <td style="color:#E85D2C;font-weight:900;text-align:center" contenteditable="true">${r.keyword||"-"}</td>
        <td style="font-size:7.5pt" contenteditable="true">${r.description||"-"}</td>
        <td style="font-size:7.5pt" contenteditable="true">${r.personnel||"-"}</td>
        <td style="font-size:7pt;color:#888;text-align:center" contenteditable="true">${r.notes||"-"}</td>
      </tr>
    `).join("");

    const checkRows = result.checklist.map((r,i) => `
      <tr style="background:${i%2===0?"#fff":"#fafaf9"}">
        <td style="text-align:center;font-weight:900;color:#155855;white-space:nowrap">${r.number}</td>
        <td style="font-weight:700;white-space:nowrap" contenteditable="true">${r.category}</td>
        <td contenteditable="true">${r.item}</td>
        <td style="text-align:center;font-size:16px">☐</td>
        <td style="white-space:nowrap" contenteditable="true">${r.notes||"-"}</td>
      </tr>
    `).join("");

    const schedRows = result.schedule.map((r,i) => `
      <tr style="background:${i%2===0?"#EDF8F7":"#fff"}">
        <td style="text-align:center;font-weight:900;color:#155855" contenteditable="true">${r.time||"-"}</td>
        <td style="font-weight:700" contenteditable="true">${r.activity||"-"}</td>
        <td style="color:#E85D2C" contenteditable="true">${r.type||"-"}</td>
        <td contenteditable="true">${r.requirements||"-"}</td>
        <td contenteditable="true">${r.notes||"-"}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${hospitalName} 촬영 콘티</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Noto Sans KR',sans-serif; font-size:9pt; color:#222; background:#fff; }

  .page-header { display:flex; align-items:center; justify-content:space-between; background:#155855; padding:10px 16px; color:#fff; }
  .brand { display:flex; flex-direction:column; }
  .brand-name { font-size:10pt; font-weight:900; letter-spacing:0.1em; }
  .brand-sub { font-size:7pt; opacity:0.7; margin-top:2px; }
  .doc-info { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .doc-title { font-size:13pt; font-weight:900; line-height:1.2; }
  .doc-section { font-size:9pt; font-weight:400; opacity:0.85; letter-spacing:0.05em; }
  .doc-date { font-size:8pt; opacity:0.8; text-align:right; }
  .orange-bar { height:3px; background:#E85D2C; }

  .section { padding:16px; }
  .section-title { font-size:11pt; font-weight:900; color:#155855; margin-bottom:10px; border-left:4px solid #E85D2C; padding-left:8px; }
  .section-meta { font-size:8pt; color:#888; margin-bottom:10px; }

  table { width:100%; border-collapse:collapse; font-size:8pt; table-layout:fixed; }
  th { background:#155855; color:#fff; font-weight:900; padding:7px 6px; text-align:center; border:1px solid #0e3f3c; font-size:8pt; word-break:keep-all; }
  td { padding:6px; border:1px solid #e5e7eb; vertical-align:top; line-height:1.6; word-break:keep-all; overflow-wrap:break-word; white-space:pre-wrap; }

  /* 표지 */
  .cover { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:90vh; text-align:center; padding:40px; }
  .cover-logo { font-size:11pt; font-weight:900; letter-spacing:0.2em; color:#155855; margin-bottom:6px; }
  .cover-logo-sub { font-size:8pt; color:#888; margin-bottom:60px; }
  .cover-hospital { font-size:28pt; font-weight:900; color:#155855; margin-bottom:12px; word-break:keep-all; }
  .cover-subtitle { font-size:16pt; font-weight:700; color:#E85D2C; margin-bottom:40px; }
  .cover-meta { display:flex; flex-direction:column; gap:10px; background:#F0F9F8; border:1px solid #C8DDD9; border-radius:12px; padding:24px 40px; margin-bottom:40px; min-width:320px; }
  .cover-meta-row { display:flex; align-items:center; gap:16px; font-size:10pt; }
  .cover-meta-label { color:#888; font-size:9pt; min-width:60px; }
  .cover-meta-value { font-weight:700; color:#222; }
  .cover-bar { width:60px; height:4px; background:#E85D2C; border-radius:2px; margin:0 auto; }
  .cover-toc { margin-top:20px; display:flex; gap:20px; }
  .cover-toc-item { background:#fff; border:1px solid #C8DDD9; border-radius:8px; padding:10px 18px; font-size:9pt; color:#155855; font-weight:700; }

  /* 페이지 나누기 */
  .page-break { page-break-before:always; margin-top:0; }

  /* 인쇄 설정 */
  @media print {
    @page { margin:8mm; }
    @page :first { margin-top:8mm; }
    body { font-size:8pt; }
    .no-print { display:none; }
  }

  /* 인쇄 버튼 */
  .print-btn {
    position:fixed; top:16px; right:16px;
    background:#155855; color:#fff; border:none;
    padding:10px 20px; border-radius:8px; font-family:inherit;
    font-size:13pt; font-weight:700; cursor:pointer; z-index:999;
  }
  .print-btn:hover { background:#0e3f3c; }

  /* 하단 요약 */
  .summary { background:#F0F9F8; border:1px solid #C8DDD9; border-radius:6px; padding:8px 12px; margin-top:10px; font-size:8pt; color:#155855; }
</style>
</head>
<body>

<div class="no-print edit-bar">
  <div class="edit-bar-title">📝 최종 확인 및 편집</div>
  <div class="edit-bar-desc">인쇄 전 내용을 직접 클릭하여 수정할 수 있습니다. 파란색 밑줄 항목은 편집 가능합니다.</div>
  <button class="print-btn" onclick="window.print()">🖨️ PDF 저장 / 인쇄</button>
</div>

<!-- ① 표지 -->
<div class="cover">
  <div class="cover-logo" contenteditable="true">PHOTO CLINIC</div>
  <div class="cover-logo-sub" contenteditable="true">병원 브랜딩 포토그래피</div>
  <div class="cover-bar" style="margin-bottom:40px"></div>
  <div class="cover-hospital" contenteditable="true">${hospitalName}</div>
  <div class="cover-subtitle" contenteditable="true">브랜드촬영 콘티</div>
  <div class="cover-meta">
    <div class="cover-meta-row">
      <span class="cover-meta-label">촬영일자</span>
      <span class="cover-meta-value" contenteditable="true" style="min-width:160px;display:inline-block" data-placeholder="날짜 입력">　</span>
    </div>
    <div class="cover-meta-row">
      <span class="cover-meta-label">진료과</span>
      <span class="cover-meta-value" contenteditable="true">${specialties}</span>
    </div>
    <div class="cover-meta-row">
      <span class="cover-meta-label">총 컷 수</span>
      <span class="cover-meta-value" contenteditable="true">${result.conti.length}컷</span>
    </div>
    <div class="cover-meta-row">
      <span class="cover-meta-label">작성일</span>
      <span class="cover-meta-value" contenteditable="true">${today}</span>
    </div>
  </div>
  <div class="cover-toc">
    <div class="cover-toc-item" contenteditable="true">📋 &nbsp;촬영 콘티</div>
    <div class="cover-toc-item" contenteditable="true">✅ &nbsp;준비 체크리스트</div>
    <div class="cover-toc-item" contenteditable="true">⏰ &nbsp;타임테이블</div>
  </div>
</div>

<!-- ② 촬영 콘티 -->
<div class="page-break"></div>
${header("촬영 콘티")}
<div class="section">
  <p class="section-meta">진료과: ${specialties} &nbsp;·&nbsp; 총 ${result.conti.length}컷</p>
  <table>
    <thead>
      <tr>
        <th style="width:58px">진료과</th>
        <th style="width:40px">소요시간</th>
        <th style="width:52px">장소</th>
        <th style="width:100px">카메라 구도</th>
        <th style="width:68px">키워드</th>
        <th>설명</th>
        <th style="width:86px">필요인원/환자역할</th>
        <th style="width:40px">비고</th>
      </tr>
    </thead>
    <tbody>${contiRows}</tbody>
  </table>
</div>

<!-- ③ 준비 체크리스트 -->
<div class="page-break"></div>
${header("준비 체크리스트")}
<div class="section">
  <p class="section-meta">총 ${result.checklist.length}개 항목</p>
  <table>
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th style="width:90px">분류</th>
        <th>체크리스트 항목</th>
        <th style="width:44px">준비여부</th>
        <th style="width:70px">비고</th>
      </tr>
    </thead>
    <tbody>${checkRows}</tbody>
  </table>
</div>

<!-- ④ 타임테이블 -->
<div class="page-break"></div>
${header("타임테이블")}
<div class="section">
  <p class="section-meta">총 ${result.schedule.length}개 일정</p>
  <table>
    <thead>
      <tr>
        <th style="width:90px">시간</th>
        <th style="width:110px">내용</th>
        <th style="width:60px">구분</th>
        <th>요청사항</th>
        <th style="width:60px">비고</th>
      </tr>
    </thead>
    <tbody>${schedRows}</tbody>
  </table>
</div>

<script>
  // 폰트 로드 후 자동으로 인쇄 다이얼로그 열기
  // 자동 인쇄 없음 — 사용자가 편집 후 직접 인쇄 버튼 클릭
</script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) win.document.title = `${hospitalName}_촬영콘티`;
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

    /* ── Excel 다운로드 (열너비 적용, 3시트) ── */
  const handleSpreadsheetDownload = async () => {
    if (!result) return;
    const XLSX = await import("xlsx");
    const hospitalName = form.hospitalName || "병원";

    const styleSheet = (ws: any, colWidths: number[]) => {
      ws["!cols"] = colWidths.map(w => ({ wch: w }));
      return ws;
    };

    const contiWs = styleSheet(XLSX.utils.aoa_to_sheet([
      ["진료과","소요시간","장소","카메라 구도","키워드","설명","필요인원/환자역할","비고"],
      ...result.conti.map(r => [r.category,r.duration,r.location,r.cameraAngle,r.keyword,r.description,r.personnel,r.notes])
    ]), [14,8,14,22,18,40,26,14]);

    const checkWs = styleSheet(XLSX.utils.aoa_to_sheet([
      ["번호","분류","체크리스트 항목","준비여부","비고"],
      ...result.checklist.map(r => [r.number,r.category,r.item,"☐",r.notes])
    ]), [6,16,50,10,20]);

    const schedWs = styleSheet(XLSX.utils.aoa_to_sheet([
      ["시간","내용","구분","요청사항","비고"],
      ...result.schedule.map(r => [r.time,r.activity,r.type,r.requirements,r.notes])
    ]), [22,30,14,28,16]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, contiWs, "촬영콘티");
    XLSX.utils.book_append_sheet(wb, checkWs, "준비체크리스트");
    XLSX.utils.book_append_sheet(wb, schedWs, "타임테이블");
    XLSX.writeFile(wb, `${hospitalName}_촬영콘티.xlsx`);
  };

  /* ════════════════════════════════
     렌더
  ════════════════════════════════ */
  return (
    <>
    <div style={{ minHeight: "100vh", background: "var(--ivory)" }}>
      <PageHeader title="Conti Generator" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 24px" }}>

        {/* ══ 입력 폼 ══ */}
        {!result && (
          <section>
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <p className="admin-kicker">병원 • 메디컬 성장 플랫폼</p>
                  <h1 style={{ margin: 0, color: "var(--deep-green)", fontSize: "clamp(26px,5vw,44px)", fontWeight: 800 }}>촬영 콘티 자동 생성</h1>
                  <p style={{ marginTop: 12, color: "#4d5b56", fontSize: 15, lineHeight: 1.75 }}>병원 정보를 입력하면 AI가 촬영 콘티 · 준비 체크리스트 · 타임테이블을 한 번에 생성합니다.</p>
                </div>
                {/* 불러오기 버튼 */}
                <div>
                  <button
                    type="button"
                    onClick={openLoadPanel}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      padding: "0 18px", minHeight: 42,
                      border: "1.5px dashed rgba(21,88,85,0.4)",
                      borderRadius: 8, background: "#fff", color: "#155855",
                      fontWeight: 800, fontSize: 14, cursor: "pointer",
                      transition: "all 160ms ease"
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(21,88,85,0.05)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                  >
                    <FileText size={16} /> 이전 콘티 불러오기
                  </button>
                </div>
              </div>
            </div>

            {/* ══ ⚡ 빠른 시작 ══ */}
            <div style={{
              background: "linear-gradient(135deg, #155855 0%, #1e7870 100%)",
              borderRadius: 12, padding: 28, marginBottom: 8,
              boxShadow: "0 12px 36px rgba(21,88,85,0.22)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Zap size={18} color="#FEF3C7" fill="#FEF3C7" />
                <span style={{ color: "#FEF3C7", fontSize: 12, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Quick Start
                </span>
              </div>
              <h2 style={{ margin: "0 0 6px", color: "#ffffff", fontSize: "clamp(18px,3vw,26px)", fontWeight: 800 }}>
                진료과만 선택하면 기본 콘티 바로 생성
              </h2>
              <p style={{ margin: "0 0 20px", color: "rgba(255,255,255,0.72)", fontSize: 14, lineHeight: 1.65 }}>
                병원 규모, 직원, 장소는 진료과에 맞게 자동으로 설정됩니다.<br />
                생성 후 셀을 클릭해 직접 수정할 수 있어요.<br />
                <span style={{ color: "#FEF3C7", fontWeight: 700 }}>
                  ✦ 2개 이상 선택 시 종합병원 콘티로 생성됩니다 &nbsp;|&nbsp;
                  정형·신경·마취·재활 선택 시 C-ARM·초음파 주사치료 컷이 자동 포함됩니다
                </span>
              </p>

              {/* 진료과 선택 (흰 배경) */}
              <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
                <p style={{ margin: "0 0 10px", color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 800 }}>
                  진료과 선택 (복수 가능)
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SPECIALTY_OPTIONS.map(s => (
                    <button key={s} type="button"
                      onClick={() => setQuickSpecialties(prev =>
                        prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                      )}
                      style={{
                        padding: "6px 14px", borderRadius: 99, fontSize: 13, fontWeight: 700,
                        cursor: "pointer", transition: "all 120ms ease",
                        border: quickSpecialties.includes(s)
                          ? "1.5px solid #FEF3C7"
                          : "1.5px solid rgba(255,255,255,0.3)",
                        background: quickSpecialties.includes(s)
                          ? "#FEF3C7"
                          : "rgba(255,255,255,0.08)",
                        color: quickSpecialties.includes(s) ? "#92400E" : "rgba(255,255,255,0.9)"
                      }}
                    >{s}</button>
                  ))}
                </div>
                {quickSpecialties.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.15)" }}>
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, alignSelf: "center" }}>선택됨:</span>
                    {quickSpecialties.map(s => (
                      <span key={s} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        background: "#FEF3C7", color: "#92400E",
                        fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 99
                      }}>
                        {s}
                        <X size={11} style={{ cursor: "pointer" }}
                          onClick={() => setQuickSpecialties(prev => prev.filter(x => x !== s))} />
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {quickError && (
                <p style={{ color: "#fca5a5", fontWeight: 800, fontSize: 13, margin: "0 0 10px" }}>⚠ {quickError}</p>
              )}

              <button type="button"
                onClick={handleQuickGenerate}
                disabled={quickLoading}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "0 28px", minHeight: 48, border: "none",
                  borderRadius: 8, background: "#FEF3C7", color: "#92400E",
                  fontWeight: 900, fontSize: 15, cursor: "pointer",
                  opacity: quickLoading ? 0.7 : 1,
                  boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
                  transition: "all 160ms ease"
                }}
              >
                {quickLoading
                  ? <><span>⟳</span> 생성 중…</>
                  : <><Zap size={17} /> 기본 콘티 바로 생성</>
                }
              </button>
            </div>

            {/* 구분선 */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "8px 0" }}>
              <div style={{ flex: 1, height: 1, background: "rgba(21,88,85,0.14)" }} />
              <span style={{ color: "#9ca3af", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                또는 아래에서 상세하게 입력하기
              </span>
              <div style={{ flex: 1, height: 1, background: "rgba(21,88,85,0.14)" }} />
            </div>

            <form onSubmit={handleGenerate} style={{ display: "grid", gap: 20 }}>

              <SectionBox emoji="🏥" title="병원 기본 정보">
                <div style={{ display: "grid", gap: 14 }}>
                  <label className="field">
                    <span>병원명 *</span>
                    <input value={form.hospitalName} onChange={e => set("hospitalName", e.target.value)} placeholder="예: 운정표병원" required />
                  </label>
                  <div className="field">
                    <span>진료과목 * (복수 선택 가능)</span>
                    <SpecialtyPicker selected={form.specialties} onChange={v => set("specialties", v)} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label className="field"><span>원장님 인원</span><input type="number" min="1" value={form.doctors} onChange={e => set("doctors", e.target.value)} /></label>
                    <label className="field"><span>부원장님 인원</span><input type="number" min="0" value={form.viceDirectors} onChange={e => set("viceDirectors", e.target.value)} /></label>
                  </div>
                </div>
              </SectionBox>

              <SectionBox emoji="👥" title="직원 구성" desc="역할별 인원수와 촬영 시 맡을 역할을 입력하세요.">
                <ColHeaders cols={["역할", "인원 (명)", "촬영 시 역할 / 상세설명"]} />
                <div style={{ display: "grid", gap: 8 }}>
                  {form.staffItems.length === 0 && <EmptyRow />}
                  {form.staffItems.map((item, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "180px 80px 1fr 36px", gap: 8, alignItems: "center" }}>
                      <div><input list={`sr-${i}`} value={item.role} onChange={e => updateStaff(i, { role: e.target.value })} placeholder="역할 선택 또는 입력" style={{ minHeight: 38, fontSize: 13, width: "100%" }} /><datalist id={`sr-${i}`}>{STAFF_ROLE_PRESETS.map(r => <option key={r} value={r} />)}</datalist></div>
                      <input type="number" min="1" value={item.count} onChange={e => updateStaff(i, { count: parseInt(e.target.value) || 1 })} style={{ minHeight: 38, fontSize: 13, textAlign: "center" }} />
                      <input value={item.detail} onChange={e => updateStaff(i, { detail: e.target.value })} placeholder="예: 진료 연출 시 환자 안내, 수액 체크 역할" style={{ minHeight: 38, fontSize: 13 }} />
                      <DeleteBtn onClick={() => set("staffItems", form.staffItems.filter((_, idx) => idx !== i))} />
                    </div>
                  ))}
                </div>
                <AddBtn label="직원 항목 추가" onClick={() => set("staffItems", [...form.staffItems, { role: "", count: 1, detail: "" }])} />
              </SectionBox>

              <SectionBox emoji="🧑‍🤝‍🧑" title="환자 모델 구성" desc="환자 역할 모델의 유형·인원·촬영 상황을 입력하세요.">
                <ColHeaders cols={["모델 유형", "인원 (명)", "역할 / 촬영 상황 설명"]} />
                <div style={{ display: "grid", gap: 8 }}>
                  {form.patientItems.length === 0 && <EmptyRow />}
                  {form.patientItems.map((item, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "220px 80px 1fr 36px", gap: 8, alignItems: "center" }}>
                      <div><input list={`pt-${i}`} value={item.type} onChange={e => updatePatient(i, { type: e.target.value })} placeholder="유형 선택 또는 입력" style={{ minHeight: 38, fontSize: 13, width: "100%" }} /><datalist id={`pt-${i}`}>{PATIENT_TYPE_PRESETS.map(t => <option key={t} value={t} />)}</datalist></div>
                      <input type="number" min="1" value={item.count} onChange={e => updatePatient(i, { count: parseInt(e.target.value) || 1 })} style={{ minHeight: 38, fontSize: 13, textAlign: "center" }} />
                      <input value={item.detail} onChange={e => updatePatient(i, { detail: e.target.value })} placeholder="예: 초음파 진료 장면, 수액실에서 부모와 대기" style={{ minHeight: 38, fontSize: 13 }} />
                      <DeleteBtn onClick={() => set("patientItems", form.patientItems.filter((_, idx) => idx !== i))} />
                    </div>
                  ))}
                </div>
                <AddBtn label="환자 모델 항목 추가" onClick={() => set("patientItems", [...form.patientItems, { type: "", count: 1, detail: "" }])} />
              </SectionBox>

              <SectionBox emoji="📍" title="촬영 공간 / 장소" desc="층 또는 구역별로 항목을 추가하세요.">
                <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 36px", gap: 8, marginBottom: 6 }}>
                  {["층/구역", "공간 목록", "비고", ""].map((h, i) => <span key={i} style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af" }}>{h}</span>)}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {form.locationItems.length === 0 && <EmptyRow />}
                  {form.locationItems.map((item, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 36px", gap: 8, alignItems: "center" }}>
                      <input value={item.floor} onChange={e => updateLocation(i, { floor: e.target.value })} placeholder="예: 5층" style={{ minHeight: 38, fontSize: 13 }} />
                      <input value={item.spaces} onChange={e => updateLocation(i, { spaces: e.target.value })} placeholder="예: 외래(원장실, 초음파실, 수액실)" style={{ minHeight: 38, fontSize: 13 }} />
                      <input value={item.notes} onChange={e => updateLocation(i, { notes: e.target.value })} placeholder="예: 햇볕 잘 드는 공간 우선" style={{ minHeight: 38, fontSize: 13 }} />
                      <DeleteBtn onClick={() => set("locationItems", form.locationItems.filter((_, idx) => idx !== i))} />
                    </div>
                  ))}
                </div>
                <AddBtn label="장소 항목 추가" onClick={() => set("locationItems", [...form.locationItems, { floor: "", spaces: "", notes: "" }])} />
              </SectionBox>

              <SectionBox emoji="🎯" title="촬영 목적 / 요청사항">
                <div style={{ display: "grid", gap: 14 }}>
                  <label className="field"><span>촬영 목적 / 분위기 키워드 *</span><textarea value={form.purpose} onChange={e => set("purpose", e.target.value)} placeholder="예: 홈페이지 메인용. 따뜻하고 전문적인 소아과 이미지, 가족 친화적인 분위기" style={{ minHeight: 80 }} required /></label>
                  <label className="field"><span>특별 요청사항</span><textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="예: 원장님 개별 프로필 포함, 영상 없이 사진만, 야간 인테리어 추가" style={{ minHeight: 64 }} /></label>
                </div>
              </SectionBox>

              {error && <p style={{ color: "var(--orange)", fontWeight: 800, fontSize: 14, margin: 0 }}>⚠ {error}</p>}

              <button className="admin-primary-button" type="submit" disabled={loading} style={{ width: "fit-content", padding: "0 44px", fontSize: 15, opacity: loading ? 0.7 : 1 }}>
                {loading ? <><span>⟳</span> AI 생성 중…</> : <><Sparkles size={18} /> 콘티 자동 생성</>}
              </button>
            </form>
          </section>
        )}

        {/* ══ 결과 ══ */}
        {result && !fieldView && (
          <section>
            {/* 결과 헤더 */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 20 }}>
              <div>
                <p className="admin-kicker">생성 완료</p>
                <h2 style={{ margin: 0, color: "var(--deep-green)", fontSize: 28, fontWeight: 800 }}>{resultTitle} 촬영 콘티</h2>
                <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>{form.specialties.join(" · ")}</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="admin-secondary-link" onClick={() => setResult(null)} style={{ cursor: "pointer" }}>
                  <RotateCcw size={15} /> 다시 입력
                </button>
                <button onClick={() => setFieldView(true)} style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "0 18px", minHeight: 42, border: "1px solid #7c3aed",
                  borderRadius: 8, background: "#f5f3ff", color: "#7c3aed",
                  fontWeight: 900, fontSize: 14, cursor: "pointer"
                }}>
                  📋 현장 뷰
                </button>
                <button onClick={handleSaveJSON} style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "0 18px", minHeight: 42, border: "1.5px dashed rgba(21,88,85,0.4)",
                  borderRadius: 8, background: "#fff", color: "#155855",
                  fontWeight: 900, fontSize: 14, cursor: "pointer"
                }}>
                  <FileText size={16} /> 콘티 저장
                </button>
                <button onClick={handleSpreadsheetDownload} style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "0 18px", minHeight: 42, border: "1px solid #16a34a",
                  borderRadius: 8, background: "#f0fdf4", color: "#16a34a",
                  fontWeight: 900, fontSize: 14, cursor: "pointer"
                }}>
                  <FileSpreadsheet size={16} /> Excel 다운로드
                </button>
                <button className="admin-primary-button" onClick={handlePDF} style={{ padding: "0 20px", cursor: "pointer" }}>
                  <Download size={16} /> PDF 다운로드
                </button>
              </div>
            </div>

            {/* 편집 안내 */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(21,88,85,0.06)", border: "1px solid rgba(21,88,85,0.14)",
              borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "#155855",
              fontWeight: 700, marginBottom: 16
            }}>
              <Pencil size={13} /> 셀 클릭 즉시 편집 · ⠿ 핸들로 드래그하여 순서 변경
            </div>

            {/* 탭 */}
            <div style={{ display: "flex", borderBottom: "2px solid rgba(21,88,85,0.12)", marginBottom: 16 }}>
              {([
                { key: "conti",     label: "촬영 콘티",       Icon: ClipboardList },
                { key: "checklist", label: "준비 체크리스트", Icon: CheckSquare },
                { key: "schedule",  label: "타임테이블",       Icon: Clock }
              ] as const).map(({ key, label, Icon }) => (
                <button key={key} onClick={() => setTab(key)} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "10px 20px",
                  border: "none", borderBottom: tab === key ? "2px solid #155855" : "2px solid transparent",
                  background: "none", color: tab === key ? "#155855" : "#6b7280",
                  fontWeight: 800, fontSize: 14, cursor: "pointer", marginBottom: -2
                }}>
                  <Icon size={15} />{label}
                </button>
              ))}
            </div>

            {/* 테이블 */}
            <div ref={printRef} style={{ background: "#fff", borderRadius: 8, border: "1px solid rgba(21,88,85,0.12)", overflow: "hidden" }}>

              {/* ── 촬영 콘티 ── */}
              {tab === "conti" && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["", "진료과", "소요시간", "장소", "카메라 구도", "키워드", "설명", "필요인원 / 환자역할", "비고", ""].map((h, idx) => (
                          <th key={idx} style={{ ...TH, ...(h === "" ? { width: 36, background: "#0e3f3c" } : {}) }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.conti.map((row, i) => {
                        const rawColor = row.color ? row.color.split("|") : null;
                        const c = rawColor
                          ? { bg: rawColor[0], text: rawColor[1] }
                          : getColor(row.category);
                        const isDragOver = dragOver?.type === "conti" && dragOver.index === i;
                        return (
                          <tr key={i}
                            draggable
                            onDragStart={() => handleDragStart("conti", i)}
                            onDragOver={e => handleDragOver(e, "conti", i)}
                            onDrop={() => handleDrop("conti", i)}
                            onDragEnd={handleDragEnd}
                            style={{ outline: isDragOver ? "2px solid #155855" : "none", background: isDragOver ? "rgba(21,88,85,0.06)" : undefined }}
                          >
                            <td style={{ ...TD, width: 36, padding: "6px 4px", cursor: "grab" }}>
                              <DragHandle />
                            </td>
                            <td style={{ ...TD, background: c.bg, minWidth: 80 }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                                <ColorPickerCell
                                  bg={c.bg} text={c.text}
                                  onChange={(bg, text) => updateContiColor(i, bg, text)}
                                />
                                <EditableCell value={row.category} onChange={v => updateConti(i, "category", v)} bold color={c.text} />
                              </div>
                            </td>
                            <td style={{ ...TD, minWidth: 70 }}><EditableCell value={row.duration} onChange={v => updateConti(i, "duration", v)} /></td>
                            <td style={{ ...TD, minWidth: 80 }}><EditableCell value={row.location} onChange={v => updateConti(i, "location", v)} /></td>
                            <td style={{ ...TD, minWidth: 100 }}><EditableCell value={row.cameraAngle} onChange={v => updateConti(i, "cameraAngle", v)} /></td>
                            <td style={{ ...TD, minWidth: 100 }}><EditableCell value={row.keyword} onChange={v => updateConti(i, "keyword", v)} color="var(--orange)" bold /></td>
                            <td style={{ ...TD, minWidth: 180 }}><EditableCell value={row.description} onChange={v => updateConti(i, "description", v)} multiline /></td>
                            <td style={{ ...TD, minWidth: 140 }}><EditableCell value={row.personnel} onChange={v => updateConti(i, "personnel", v)} /></td>
                            <td style={{ ...TD, minWidth: 80 }}><EditableCell value={row.notes} onChange={v => updateConti(i, "notes", v)} placeholder="-" /></td>
                            <td style={{ ...TD, width: 36, padding: "6px 4px" }}>
                              <DeleteRowBtn onClick={() => delContiRow(i)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ padding: "10px 12px", borderTop: "1px dashed rgba(21,88,85,0.15)" }}>
                    <button onClick={addContiRow} style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "5px 12px", border: "1px dashed rgba(21,88,85,0.3)",
                      borderRadius: 6, background: "transparent", color: "#155855",
                      fontSize: 12, fontWeight: 800, cursor: "pointer"
                    }}>
                      <Plus size={13} /> 행 추가
                    </button>
                  </div>
                </div>
              )}

              {/* ── 체크리스트 ── */}
              {tab === "checklist" && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["", "번호", "분류", "체크리스트", "준비여부", "비고", ""].map((h, idx) => (
                          <th key={idx} style={{ ...TH, ...(h === "" ? { width: 36, background: "#0e3f3c" } : {}) }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.checklist.map((row, i) => {
                        const isDragOver = dragOver?.type === "checklist" && dragOver.index === i;
                        return (
                          <tr key={i}
                            draggable
                            onDragStart={() => handleDragStart("checklist", i)}
                            onDragOver={e => handleDragOver(e, "checklist", i)}
                            onDrop={() => handleDrop("checklist", i)}
                            onDragEnd={handleDragEnd}
                            style={{ background: isDragOver ? "rgba(21,88,85,0.06)" : i % 2 === 0 ? "#fff" : "#fafaf9", outline: isDragOver ? "2px solid #155855" : "none" }}
                          >
                            <td style={{ ...TD, width: 36, padding: "6px 4px", cursor: "grab" }}><DragHandle /></td>
                            <td style={{ ...TD, width: 48, textAlign: "center", fontWeight: 800, color: "#155855" }}>{row.number}</td>
                            <td style={{ ...TD, minWidth: 100 }}><EditableCell value={row.category} onChange={v => updateChecklist(i, "category", v)} bold /></td>
                            <td style={{ ...TD, minWidth: 200 }}><EditableCell value={row.item} onChange={v => updateChecklist(i, "item", v)} /></td>
                            <td style={{ ...TD, width: 80 }}>
                              <div style={{ width: 20, height: 20, border: "2px solid rgba(21,88,85,0.25)", borderRadius: 4 }} />
                            </td>
                            <td style={{ ...TD, minWidth: 120 }}><EditableCell value={row.notes} onChange={v => updateChecklist(i, "notes", v)} placeholder="-" /></td>
                            <td style={{ ...TD, width: 36, padding: "6px 4px" }}>
                              <DeleteRowBtn onClick={() => delChecklistRow(i)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ padding: "10px 12px", borderTop: "1px dashed rgba(21,88,85,0.15)" }}>
                    <button onClick={addChecklistRow} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "1px dashed rgba(21,88,85,0.3)", borderRadius: 6, background: "transparent", color: "#155855", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                      <Plus size={13} /> 행 추가
                    </button>
                  </div>
                </div>
              )}

              {/* ── 타임테이블 ── */}
              {tab === "schedule" && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["", "시간", "소요시간", "내용", "구분", "요청사항", "비고", ""].map((h, idx) => (
                          <th key={idx} style={{ ...TH, ...(h === "" ? { width: 36, background: "#0e3f3c" } : {}) }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.schedule.map((row, i) => {
                        const isDragOver = dragOver?.type === "schedule" && dragOver.index === i;
                        return (
                          <tr key={i}
                            draggable
                            onDragStart={() => handleDragStart("schedule", i)}
                            onDragOver={e => handleDragOver(e, "schedule", i)}
                            onDrop={() => handleDrop("schedule", i)}
                            onDragEnd={handleDragEnd}
                            style={{ background: isDragOver ? "rgba(21,88,85,0.06)" : i % 2 === 0 ? "#fff" : "#fafaf9", outline: isDragOver ? "2px solid #155855" : "none" }}
                          >
                            <td style={{ ...TD, width: 36, padding: "6px 4px", cursor: "grab" }}><DragHandle /></td>
                            <td style={{ ...TD, minWidth: 130 }}>
                              <TimePickerCell
                                value={row.time}
                                onChange={v => updateSchedule(i, "time", v)}
                              />
                            </td>
                            <td style={{ ...TD, minWidth: 80 }}>
                              <DurationPickerCell
                                timeValue={row.time}
                                onTimeChange={v => updateSchedule(i, "time", v)}
                              />
                            </td>
                            <td style={{ ...TD, minWidth: 140 }}><EditableCell value={row.activity} onChange={v => updateSchedule(i, "activity", v)} bold /></td>
                            <td style={{ ...TD, minWidth: 80 }}><EditableCell value={row.type} onChange={v => updateSchedule(i, "type", v)} color="var(--orange)" /></td>
                            <td style={{ ...TD, minWidth: 160 }}><EditableCell value={row.requirements} onChange={v => updateSchedule(i, "requirements", v)} /></td>
                            <td style={{ ...TD, minWidth: 100 }}><EditableCell value={row.notes} onChange={v => updateSchedule(i, "notes", v)} placeholder="-" /></td>
                            <td style={{ ...TD, width: 36, padding: "6px 4px" }}>
                              <DeleteRowBtn onClick={() => delScheduleRow(i)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ padding: "10px 12px", borderTop: "1px dashed rgba(21,88,85,0.15)" }}>
                    <button onClick={addScheduleRow} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "1px dashed rgba(21,88,85,0.3)", borderRadius: 6, background: "transparent", color: "#155855", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                      <Plus size={13} /> 행 추가
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
                <FileText size={12} style={{ display: "inline", marginRight: 4 }} />
                PDF는 현재 탭 기준, Excel은 3개 탭(촬영콘티·체크리스트·타임테이블) 전체를 한 파일로 저장합니다.
              </p>
            </div>
          </section>
        )}

        {/* ══ 아이패드 현장 뷰 ══ */}
        {result && fieldView && (
          <div style={{ position: "fixed", inset: 0, background: "#0f1f1e", zIndex: 200, overflowY: "auto" }}>
            {/* 현장 뷰 헤더 */}
            <div style={{
              position: "sticky", top: 0, zIndex: 10,
              background: "#155855", padding: "16px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24 }}>📋</span>
                <div>
                  <div style={{ color: "#fff", fontWeight: 900, fontSize: 20 }}>{resultTitle} 촬영 콘티</div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{form.specialties.join(" · ")}</div>
                </div>
              </div>
              <button onClick={() => setFieldView(false)} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 20px", border: "1.5px solid rgba(255,255,255,0.3)",
                borderRadius: 10, background: "rgba(255,255,255,0.1)", color: "#fff",
                fontWeight: 800, fontSize: 15, cursor: "pointer"
              }}>✕ 편집 모드로</button>
            </div>

            <div style={{ padding: "24px 20px", maxWidth: 960, margin: "0 auto" }}>

              {/* 촬영 콘티 카드 목록 */}
              <div style={{ marginBottom: 36 }}>
                <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 900, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  🎬 <span>촬영 콘티</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>({result.conti.length}컷)</span>
                </h2>
                <div style={{ display: "grid", gap: 14 }}>
                  {result.conti.map((row, i) => {
                    const rawColor = row.color ? row.color.split("|") : null;
                    const c = rawColor ? { bg: rawColor[0], text: rawColor[1] } : getColor(row.category);
                    return (
                      <div key={i} style={{
                        background: "#1a2e2c", borderRadius: 16,
                        border: `2px solid ${c.bg}`,
                        overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
                      }}>
                        {/* 카드 헤더 */}
                        <div style={{
                          background: c.bg, padding: "12px 20px",
                          display: "flex", alignItems: "center", justifyContent: "space-between"
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{
                              background: "rgba(0,0,0,0.15)", color: c.text,
                              fontSize: 12, fontWeight: 900, padding: "2px 10px", borderRadius: 99
                            }}>#{i + 1}</span>
                            <span style={{ color: c.text, fontWeight: 900, fontSize: 18 }}>{row.category}</span>
                          </div>
                          <span style={{
                            background: "rgba(0,0,0,0.12)", color: c.text,
                            fontSize: 13, fontWeight: 800, padding: "4px 14px", borderRadius: 99
                          }}>⏱ {row.duration}</span>
                        </div>
                        {/* 카드 바디 */}
                        <div style={{ padding: "16px 20px", display: "grid", gap: 12 }}>
                          {/* 키워드 */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#E85D2C", fontWeight: 900, fontSize: 20 }}>{row.keyword}</span>
                          </div>
                          {/* 설명 */}
                          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: 1.7, margin: 0, whiteSpace: "pre-line" }}>
                            {row.description}
                          </p>
                          {/* 메타 정보 */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
                            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px" }}>
                              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>📍 장소</div>
                              <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{row.location || "—"}</div>
                            </div>
                            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px" }}>
                              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>📷 카메라</div>
                              <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{row.cameraAngle || "—"}</div>
                            </div>
                            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px" }}>
                              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>👥 필요인원</div>
                              <div style={{ color: "#fff", fontSize: 14 }}>{row.personnel || "—"}</div>
                            </div>
                            {row.notes && (
                              <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px" }}>
                                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>📝 비고</div>
                                <div style={{ color: "#fff", fontSize: 14 }}>{row.notes}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 체크리스트 */}
              <div style={{ marginBottom: 36 }}>
                <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 900, marginBottom: 16 }}>✅ 준비 체크리스트</h2>
                <div style={{ display: "grid", gap: 8 }}>
                  {result.checklist.map((row, i) => (
                    <label key={i} style={{
                      display: "flex", alignItems: "center", gap: 14,
                      background: "#1a2e2c", borderRadius: 12, padding: "14px 18px",
                      cursor: "pointer", userSelect: "none"
                    }}>
                      <input type="checkbox" style={{ width: 24, height: 24, accentColor: "#155855", cursor: "pointer", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 700 }}>{row.category} · </span>
                        <span style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}>{row.item}</span>
                        {row.notes && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginLeft: 8 }}>({row.notes})</span>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 타임테이블 */}
              <div style={{ marginBottom: 40 }}>
                <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 900, marginBottom: 16 }}>⏰ 타임테이블</h2>
                <div style={{ display: "grid", gap: 8 }}>
                  {result.schedule.map((row, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "stretch", gap: 0,
                      background: "#1a2e2c", borderRadius: 12, overflow: "hidden"
                    }}>
                      <div style={{
                        background: "#155855", padding: "14px 18px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        minWidth: 100, flexShrink: 0
                      }}>
                        <span style={{ color: "#fff", fontWeight: 900, fontSize: 15 }}>{row.time}</span>
                      </div>
                      <div style={{ padding: "14px 18px", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{row.activity}</span>
                          {row.type && <span style={{ color: "#E85D2C", fontSize: 12, fontWeight: 700, background: "rgba(232,93,44,0.15)", padding: "2px 8px", borderRadius: 99 }}>{row.type}</span>}
                        </div>
                        {row.requirements && <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{row.requirements}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>

    {/* 저장 완료 토스트 */}
    {saveToast && (
      <div style={{
        position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)",
        zIndex: 9999, background: "#155855", color: "#fff",
        padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 800,
        boxShadow: "0 8px 24px rgba(21,88,85,0.3)",
        animation: "fadeIn .2s ease"
      }}>
        ✓ 콘티가 저장됐어요
      </div>
    )}

    {/* 불러오기 패널 */}
    {showLoadPanel && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center"
      }} onClick={() => setShowLoadPanel(false)}>
        <div style={{
          background: "#fff", borderRadius: 16, width: "min(560px, 90vw)",
          maxHeight: "70vh", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)"
        }} onClick={e => e.stopPropagation()}>
          {/* 패널 헤더 */}
          <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(21,88,85,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 900, color: "#155855" }}>📂 저장된 콘티</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>클릭하면 바로 불러와요 · 최대 5개 보관</div>
            </div>
            <button onClick={() => setShowLoadPanel(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>✕</button>
          </div>
          {/* 목록 */}
          <div style={{ overflowY: "auto", padding: "12px 16px", flex: 1 }}>
            {savedList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 }}>
                저장된 콘티가 없어요<br />
                <span style={{ fontSize: 12 }}>콘티 생성 후 "콘티 저장" 버튼을 눌러주세요</span>
              </div>
            ) : savedList.map(entry => (
              <div key={entry.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", borderRadius: 10, marginBottom: 8,
                border: "1px solid rgba(21,88,85,0.12)", background: "#fafaf9",
                cursor: "pointer", transition: "all 120ms ease"
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(21,88,85,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = "#fafaf9")}
                onClick={() => loadConti(entry)}
              >
                <div style={{ fontSize: 28, flexShrink: 0 }}>🎬</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#155855", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.hospitalName}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {entry.specialties?.join(" · ")} &nbsp;·&nbsp; {new Date(entry.savedAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                    {entry.result.conti.length}컷 · 체크 {entry.result.checklist.length}개
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteConti(entry.id); }}
                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 6, borderRadius: 6, flexShrink: 0, opacity: 0.6 }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                  title="삭제"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* 올리비아 채팅 - 콘티 페이지 컨텍스트 */}
    <OliviaChat
      pageContext="촬영 콘티 생성 페이지"
      contextData={result ? {
        병원명: form.hospitalName || "미입력",
        진료과: form.specialties.join(", ") || "미입력",
        상태: "콘티 생성 완료",
      } : {
        상태: "콘티 입력 중",
      }}
      contiData={result ?? null}
      onContiUpdate={(updated: any) => {
        if (updated?.conti)     setResult(prev => prev ? { ...prev, conti: updated.conti } : prev);
        if (updated?.checklist) setResult(prev => prev ? { ...prev, checklist: updated.checklist } : prev);
        if (updated?.schedule)  setResult(prev => prev ? { ...prev, schedule: updated.schedule } : prev);
      }}
    />
    </>
  );
}
