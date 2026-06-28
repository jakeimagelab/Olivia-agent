"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import OliviaChat from "@/components/OliviaChat";
import { createMailingDraft } from "@/lib/mailingQueue";
import PageHeader from "@/components/PageHeader";
import {
  ArrowLeft, CheckSquare, ChevronDown, ClipboardList, Image as ImageIcon,
  Clock, Download, FileSpreadsheet, FileText, FileUp, GripVertical,
  Link2, Pencil, Plus, RotateCcw, Sparkles, Trash2, X, Zap
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
interface SavedConti   { id: string; saved_at: string; hospital_name: string; title: string; result: ContiResult; specialties: string[]; }

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
  const historyRef = useRef<ContiResult[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);
  const resultSignatureRef = useRef("");
  const lastAutoSavedSignatureRef = useRef("");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sceneImages,      setSceneImages]      = useState<Record<string, string>>({});
  const [gptMessages,      setGptMessages]      = useState<{role:"user"|"assistant"; content:string; images?:string[]}[]>([]);
  const [gptInput,         setGptInput]         = useState("");
  const [gptLoading,       setGptLoading]       = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [imageError,       setImageError]       = useState("");

  /* ── 씬 이미지 자동 생성 (DALL-E 3) ── */
  const generateSceneImages = async (contiRows: ContiRow[]) => {
    if (!process.env.NEXT_PUBLIC_ENABLE_SCENE_IMAGES && typeof window !== "undefined") {
      // 환경변수로 ON/OFF 가능
    }
    setGeneratingImages(true);
    setImageError("");
    setSceneImages({});
    try {
      const res = await fetch("/api/conti-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: contiRows.slice(0, 10) }),
      });
      const data = await res.json();
      if (data.ok && data.images) {
        setSceneImages(data.images);
      } else {
        setImageError(data.error || "이미지 생성 실패");
      }
    } catch (e: any) {
      setImageError(e.message);
    } finally {
      setGeneratingImages(false);
    }
  };

  const [error,            setError]            = useState("");
  const [tab,              setTab]              = useState<"conti" | "scenes" | "checklist" | "schedule">("conti");
  const [fieldView,        setFieldView]        = useState(false); // 아이패드 현장 뷰
  const [resultTitle,      setResultTitle]      = useState("");
  const [quickSpecialties, setQuickSpecialties] = useState<string[]>([]);
  const [quickLoading,     setQuickLoading]     = useState(false);
  const [quickError,       setQuickError]       = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  // ── PDF 불러오기 ──
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [pdfError,    setPdfError]    = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // ── 현장뷰 URL 공유 ──
  const [shareUrl,     setShareUrl]     = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied,  setShareCopied]  = useState(false);

  // ── 현장 뷰 탭 ──
  const [fieldViewTab, setFieldViewTab] = useState<"conti" | "checklist" | "schedule">("conti");
  const [doneConti, setDoneConti] = useState<Set<number>>(new Set());
  const toggleDone = (i: number) =>
    setDoneConti(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });

  // ── 현장 뷰 드로잉 ──
  const [drawMode,      setDrawMode]      = useState(false);
  const [penColor,      setPenColor]      = useState("#E85D2C");
  const [penSize,       setPenSize]       = useState(4);
  const [penType,       setPenType]       = useState<"pen" | "marker" | "highlighter" | "brush">("pen");
  const [isEraser,      setIsEraser]      = useState(false);
  const [drawSaveState, setDrawSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const drawCanvasRef  = useRef<HTMLCanvasElement>(null);
  const isDrawingRef   = useRef(false);
  const lastPointRef   = useRef<{ x: number; y: number } | null>(null);
  const lastTimeRef    = useRef(Date.now());
  const tempDrawingRef = useRef<string | null>(null);

  /* 캔버스 → Supabase Storage 저장 */
  const saveDrawing = async () => {
    const canvas = drawCanvasRef.current;
    const hospital = form.hospitalName || resultTitle;
    if (!canvas || !hospital) return;
    setDrawSaveState("saving");
    try {
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("canvas 변환 실패");
      const fd = new FormData();
      fd.append("file", blob, "drawing.png");
      fd.append("hospital", hospital);
      const res = await fetch("/api/conti-drawing", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setDrawSaveState("saved");
      setTimeout(() => setDrawSaveState("idle"), 2500);
    } catch {
      setDrawSaveState("error");
      setTimeout(() => setDrawSaveState("idle"), 3000);
    }
  };

  /* Supabase Storage → 캔버스 복원 */
  const loadDrawing = async () => {
    const canvas = drawCanvasRef.current;
    const hospital = form.hospitalName || resultTitle;
    if (!canvas || !hospital) return;
    try {
      const res  = await fetch(`/api/conti-drawing?hospital=${encodeURIComponent(hospital)}`);
      const data = await res.json();
      if (!data.ok || !data.url) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = data.url;
    } catch { /* 드로잉 없음 — 무시 */ }
  };

  useEffect(() => {
    if (!drawMode) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const imgData = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      if (imgData) canvas.getContext("2d")?.putImageData(imgData, 0, 0);
    };
    resize();
    // 메모리 스냅샷이 있으면 우선 복원, 없으면 Supabase에서 불러오기
    if (tempDrawingRef.current) {
      const snap = tempDrawingRef.current;
      tempDrawingRef.current = null;
      const img = new Image();
      img.onload = () => canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = snap;
    } else {
      loadDrawing();
    }
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [drawMode]);

  const getDrawPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      if (!t) return null;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const applyPenStyle = (ctx: CanvasRenderingContext2D, speed = 0) => {
    if (isEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth   = penSize * 6;
      ctx.globalAlpha = 1;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      return;
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = penColor;
    ctx.fillStyle   = penColor;
    if (penType === "pen") {
      ctx.lineWidth   = penSize;
      ctx.globalAlpha = 1;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
    } else if (penType === "marker") {
      ctx.lineWidth   = penSize * 2.5;
      ctx.globalAlpha = 0.92;
      ctx.lineCap     = "square";
      ctx.lineJoin    = "miter";
    } else if (penType === "highlighter") {
      ctx.lineWidth   = penSize * 7;
      ctx.globalAlpha = 0.38;
      ctx.lineCap     = "square";
      ctx.lineJoin    = "miter";
    } else if (penType === "brush") {
      const dynamicW  = Math.max(penSize * 0.5, penSize * 2.8 * (1 - Math.min(speed * 3, 0.85)));
      ctx.lineWidth   = dynamicW;
      ctx.globalAlpha = 0.82;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
    }
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos = getDrawPos(e);
    if (!pos) return;
    isDrawingRef.current = true;
    lastPointRef.current = pos;
    lastTimeRef.current  = Date.now();
    const ctx = drawCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.save();
    applyPenStyle(ctx);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    if (isEraser) ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fill();
    ctx.restore();
  };

  const continueDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const pos  = getDrawPos(e);
    const last = lastPointRef.current;
    if (!pos || !last) return;
    const ctx = drawCanvasRef.current?.getContext("2d");
    if (!ctx) return;

    const now  = Date.now();
    const dt   = Math.max(now - lastTimeRef.current, 1);
    const dx   = pos.x - last.x;
    const dy   = pos.y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = dist / dt;
    lastTimeRef.current = now;

    ctx.save();
    applyPenStyle(ctx, speed);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    if (isEraser) ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.stroke();
    ctx.restore();
    lastPointRef.current = pos;
  };

  const stopDraw = () => { isDrawingRef.current = false; lastPointRef.current = null; };

  const clearCanvas = () => {
    const canvas = drawCanvasRef.current;
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const DRAW_COLORS = [
    { color: "#E85D2C", label: "주황" },
    { color: "#FF0000", label: "빨강" },
    { color: "#FFCC00", label: "노랑" },
    { color: "#22C55E", label: "초록" },
    { color: "#155855", label: "딥그린" },
    { color: "#3B82F6", label: "파랑" },
    { color: "#8B5CF6", label: "보라" },
    { color: "#EC4899", label: "핑크" },
    { color: "#FFFFFF", label: "흰색" },
    { color: "#D1D5DB", label: "연회색" },
    { color: "#6B7280", label: "회색" },
    { color: "#000000", label: "검정" },
  ];

  const PEN_TYPES: { key: "pen" | "marker" | "highlighter" | "brush"; label: string; icon: string }[] = [
    { key: "pen",         label: "펜",    icon: "✒️" },
    { key: "marker",      label: "마커",  icon: "🖊️" },
    { key: "highlighter", label: "형광펜", icon: "🖍️" },
    { key: "brush",       label: "브러시", icon: "🖌️" },
  ];

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
  const touchDragRef = useRef<number | null>(null);
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
      setResultTitle(quickSpecialties.join(" · ") + " 촬영 콘티");
      setForm(prev => ({ ...prev, specialties: quickSpecialties }));
      setTab("scenes");
      const contiTitle = quickSpecialties.join(" · ") + " — 기본 콘티";
      createMailingDraft({
        type: "conti",
        source_module: "conti",
        hospital_name: quickSpecialties.join(", "),
        subject: `[포토클리닉] 촬영 콘티 - ${contiTitle}`,
        body: `촬영 콘티가 생성되었습니다.\n\n진료과목: ${quickSpecialties.join(", ")}\n씬 수: ${data.scenes?.length || 0}개`,
      });
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
      setResultTitle((form.hospitalName || form.specialties.join(" · ")) + " 촬영 콘티");
      setTab("scenes");
      createMailingDraft({
        type: "conti",
        source_module: "conti",
        hospital_name: form.hospitalName || form.specialties.join(", "),
        subject: `[포토클리닉] 촬영 콘티 - ${form.hospitalName || form.specialties.join(" · ")}`,
        body: `${form.hospitalName || ""} 촬영 콘티가 생성되었습니다.\n\n진료과목: ${form.specialties.join(", ")}\n씬 수: ${data.scenes?.length || 0}개${form.notes ? "\n\n특이사항: " + form.notes : ""}`,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally { setLoading(false); }
  };

  /* ── GPT 이미지 채팅 ── */
  const sendGptMessage = async () => {
    if (!gptInput.trim() || gptLoading || !result) return;

    const userMsg = gptInput.trim();
    setGptInput("");
    setGptLoading(true);

    // 콘티 컨텍스트 자동 주입
    const contiSummary = result.conti.slice(0, 10).map((r, i) =>
      `씬${i+1}: ${r.category} / ${r.location} / ${r.keyword} / ${r.personnel}`
    ).join("\n");

    const systemPrompt = `당신은 병원 촬영 콘티 스토리보드 일러스트 생성 전문가입니다.
현재 콘티 내용:
${contiSummary}

사용자가 특정 씬 이미지를 요청하면 gpt-image-1로 생성해주세요.
스타일: 수채화 스케치, 한국 병원 환경, 따뜻한 베이지/화이트 톤, 의료 일러스트`;

    const newMessages: typeof gptMessages = [
      ...gptMessages,
      { role: "user", content: userMsg }
    ];
    setGptMessages(newMessages);

    try {
      // 1. 서버 API를 통해 GPT 응답 생성
      const chatRes = await fetch("/api/conti-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          systemPrompt,
        }),
      });

      const chatData = await chatRes.json();
      const reply = chatData.reply || "";

      // 이미지 생성 키워드 감지
      const wantsImage = /이미지|그려|생성|만들어|illustrat|draw|creat/i.test(userMsg);

      if (wantsImage) {
        // 씬 번호 추출
        const sceneMatch = userMsg.match(/씬\s*(\d+)/g);
        const sceneNums = sceneMatch
          ? sceneMatch.map(s => parseInt(s.replace(/\D/g, "")) - 1)
          : [0, 1, 2, 3];

        const targets = sceneNums.slice(0, 4).filter(i => i < result.conti.length);

        setGptMessages(prev => [...prev, {
          role: "assistant",
          content: `씬 ${targets.map(i => i+1).join(", ")} 이미지를 생성할게요! 잠시만 기다려주세요... 🎨`
        }]);

        // 이미지 생성 API 호출
        const imgRes = await fetch("/api/conti-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: targets.map(i => result.conti[i]) }),
        });
        const imgData = await imgRes.json();

        if (imgData.ok && imgData.images) {
          // 인덱스 매핑 (targets 배열 기준)
          const newImages: Record<string, string> = { ...sceneImages };
          targets.forEach((sceneIdx, arrIdx) => {
            if (imgData.images[String(arrIdx)]) {
              newImages[String(sceneIdx)] = imgData.images[String(arrIdx)];
            }
          });
          setSceneImages(newImages);

          setGptMessages(prev => [...prev.slice(0, -1), {
            role: "assistant",
            content: `✅ 씬 ${targets.map(i => i+1).join(", ")} 이미지 생성 완료! 위 카드에서 확인하세요.`,
            images: targets.map(i => newImages[String(i)]).filter(Boolean),
          }]);
        } else {
          setGptMessages(prev => [...prev.slice(0, -1), {
            role: "assistant",
            content: `❌ 이미지 생성 실패: ${imgData.errors?.join(", ") || "알 수 없는 오류"}`,
          }]);
        }
      } else {
        setGptMessages(prev => [...prev, { role: "assistant", content: reply }]);
      }
    } catch (e: any) {
      setGptMessages(prev => [...prev, {
        role: "assistant", content: `오류: ${e.message}`
      }]);
    } finally {
      setGptLoading(false);
    }
  };

  /* ── PDF 불러오기 ── */
  const handlePdfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 10 MB 이상이면 Vercel 4.5 MB 업로드 제한에 걸림
    if (file.size > 10 * 1024 * 1024) {
      setPdfError("파일이 너무 큽니다. 10MB 이하의 파일을 사용해 주세요.");
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }

    setPdfLoading(true);
    setPdfError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/conti/parse-pdf", { method: "POST", body: fd });

      // Vercel 에러 페이지나 텍스트 응답을 JSON 파싱 오류 없이 처리
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(
          res.status === 413 ? "파일이 너무 커서 업로드할 수 없습니다. (최대 4.5MB)"
          : res.status === 504 || res.status === 524 ? "AI 분석 시간이 초과됐습니다. 더 작은 파일을 사용해 주세요."
          : `서버 오류 (${res.status}): ${text.slice(0, 120)}`
        );
      }

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "PDF 인식 실패");
      const parsed: ContiResult = {
        conti:     data.conti     || [],
        checklist: data.checklist || [],
        schedule:  data.schedule  || [],
      };
      setResult(parsed);
      setResultTitle((form.hospitalName || file.name.replace(/\.(pdf|jpe?g|png|gif|webp)$/i, "")) + " 촬영 콘티");
      setTab("conti");
      setShareUrl("");
    } catch (err: any) {
      setPdfError(err.message || "PDF 인식에 실패했습니다.");
    } finally {
      setPdfLoading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  /* ── 현장뷰 공유 링크 생성 ── */
  const handleShare = async () => {
    if (!result) return;
    setShareLoading(true);
    try {
      const res  = await fetch("/api/conti/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:      resultTitle,
          hospital:   form.hospitalName,
          specialties: form.specialties.join(", "),
          result,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "공유 링크 생성 실패");
      const url = `${window.location.origin}/conti/view/${data.token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
    } catch (err: any) {
      alert("공유 링크 생성 실패: " + err.message);
    } finally {
      setShareLoading(false);
    }
  };

  /* ── Supabase 저장/불러오기 ── */
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [savedList,     setSavedList]     = useState<SavedConti[]>([]);
  const [saveToast,     setSaveToast]     = useState(false);
  const [saveLoading,   setSaveLoading]   = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [historyToast,  setHistoryToast]  = useState("");
  const [loadLoading,   setLoadLoading]   = useState(false);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [editingName,   setEditingName]   = useState("");

  useEffect(() => {
    if (!result) return;

    const signature = JSON.stringify(result);
    if (signature === resultSignatureRef.current) return;

    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      resultSignatureRef.current = signature;
      return;
    }

    const currentIndex = historyIndexRef.current;
    const nextHistory = historyRef.current.slice(0, currentIndex + 1);
    nextHistory.push(structuredClone(result));

    if (nextHistory.length > 80) nextHistory.shift();
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    resultSignatureRef.current = signature;
  }, [result]);

  const restoreHistory = (direction: "undo" | "redo") => {
    const nextIndex = direction === "undo"
      ? historyIndexRef.current - 1
      : historyIndexRef.current + 1;
    const snapshot = historyRef.current[nextIndex];
    if (!snapshot) {
      setHistoryToast(direction === "undo" ? "되돌릴 내역이 없어요." : "다시 복귀할 내역이 없어요.");
      setTimeout(() => setHistoryToast(""), 1600);
      return;
    }

    skipHistoryRef.current = true;
    historyIndexRef.current = nextIndex;
    resultSignatureRef.current = JSON.stringify(snapshot);
    setResult(structuredClone(snapshot));
    setHistoryToast(direction === "undo" ? "이전 상태로 되돌렸어요." : "다시 복귀했어요.");
    setTimeout(() => setHistoryToast(""), 1600);
  };

  const saveConti = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!result) return;
    if (silent) setAutoSaveState("saving");
    else setSaveLoading(true);

    const payload = {
      hospitalName: form.hospitalName || "병원명 없음",
      specialties: form.specialties,
      title: resultTitle,
      result,
    };

    try {
      const res = await fetch("/api/conti/saves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      lastAutoSavedSignatureRef.current = JSON.stringify(payload);
      if (silent) {
        setAutoSaveState("saved");
      } else {
        setSaveToast(true);
        setAutoSaveState("saved");
        setTimeout(() => setSaveToast(false), 2000);
      }
    } catch (e: any) {
      if (silent) setAutoSaveState("error");
      else alert("저장 실패: " + e.message);
    } finally {
      if (!silent) setSaveLoading(false);
    }
  };

  const handleSaveJSON = () => saveConti({ silent: false });

  useEffect(() => {
    if (!result) return;

    const payloadSignature = JSON.stringify({
      hospitalName: form.hospitalName || "병원명 없음",
      specialties: form.specialties,
      title: resultTitle,
      result,
    });

    if (payloadSignature === lastAutoSavedSignatureRef.current) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveState("idle");

    autoSaveTimerRef.current = setTimeout(() => {
      saveConti({ silent: true });
    }, 2500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [result, resultTitle, form.hospitalName, form.specialties]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || !result) return;

      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        handleSaveJSON();
        return;
      }

      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        restoreHistory("redo");
        return;
      }

      if (key === "z") {
        event.preventDefault();
        restoreHistory("undo");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [result, resultTitle, form.hospitalName, form.specialties, saveLoading]);

  const openLoadPanel = async () => {
    setShowLoadPanel(true);
    setLoadLoading(true);
    try {
      const res  = await fetch("/api/conti/saves");
      const data = await res.json();
      if (data.ok) setSavedList(data.data || []);
    } catch { /* 무시 */ }
    finally { setLoadLoading(false); }
  };

  const loadConti = (entry: SavedConti) => {
    setResult(entry.result);
    setResultTitle(entry.title || entry.hospital_name);
    setForm(prev => ({ ...prev, hospitalName: entry.hospital_name, specialties: entry.specialties || prev.specialties }));
    setTab("conti");
    setShowLoadPanel(false);
  };

  const deleteConti = async (id: string) => {
    await fetch(`/api/conti/saves?id=${id}`, { method: "DELETE" });
    setSavedList(prev => prev.filter(s => s.id !== id));
  };

  const renameConti = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) { setEditingId(null); return; }
    await fetch("/api/conti/saves", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hospitalName: trimmed }),
    });
    setSavedList(prev => prev.map(s => s.id === id ? { ...s, hospital_name: trimmed } : s));
    setEditingId(null);
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
      <tr style="background:${i%2===0?"#fff":"#fafaf9"}">
        <td style="background:${getCatBg(r.category)};color:${getCatFg(r.category)};font-weight:900;text-align:center;font-size:7pt;word-break:keep-all;vertical-align:middle" contenteditable="true">${r.category}</td>
        <td style="text-align:center;font-size:7pt;vertical-align:middle;white-space:nowrap" contenteditable="true">${r.duration||"-"}</td>
        <td style="text-align:center;font-size:7pt;vertical-align:middle;word-break:keep-all" contenteditable="true">${r.location||"-"}</td>
        <td style="font-size:6.5pt;color:#4b5563;line-height:1.4;vertical-align:middle" contenteditable="true">${r.cameraAngle||"-"}</td>
        <td style="color:#E85D2C;font-weight:900;text-align:center;font-size:7pt;vertical-align:middle;word-break:keep-all" contenteditable="true">${r.keyword||"-"}</td>
        <td style="font-size:7pt;vertical-align:middle;line-height:1.5" contenteditable="true">${r.description||"-"}</td>
        <td style="font-size:6.5pt;vertical-align:middle;line-height:1.4;color:#374151" contenteditable="true">${r.personnel||"-"}</td>
        <td style="font-size:6.5pt;color:#666;text-align:center;vertical-align:middle;word-break:keep-all" contenteditable="true">${r.notes||"-"}</td>
      </tr>
    `).join("");

    const checkRows = result.checklist.map((r,i) => `
      <tr style="background:${i%2===0?"#fff":"#fafaf9"}">
        <td style="text-align:center;font-weight:900;color:#155855;white-space:nowrap;vertical-align:middle;font-size:7.5pt">${r.number}</td>
        <td style="font-weight:700;white-space:nowrap;vertical-align:middle;font-size:7pt;color:#155855" contenteditable="true">${r.category}</td>
        <td style="vertical-align:middle;font-size:7.5pt" contenteditable="true">${r.item}</td>
        <td style="text-align:center;font-size:14px;vertical-align:middle">☐</td>
        <td style="white-space:nowrap;vertical-align:middle;font-size:7pt;color:#666" contenteditable="true">${r.notes||"-"}</td>
      </tr>
    `).join("");

    const schedRows = result.schedule.map((r,i) => `
      <tr style="background:${i%2===0?"#EDF8F7":"#fff"}">
        <td style="text-align:center;font-weight:900;color:#155855;white-space:nowrap;vertical-align:middle;font-size:7.5pt" contenteditable="true">${r.time||"-"}</td>
        <td style="font-weight:700;vertical-align:middle;font-size:7.5pt" contenteditable="true">${r.activity||"-"}</td>
        <td style="color:#E85D2C;text-align:center;vertical-align:middle;font-size:7pt;white-space:nowrap" contenteditable="true">${r.type||"-"}</td>
        <td style="vertical-align:middle;font-size:7.5pt" contenteditable="true">${r.requirements||"-"}</td>
        <td style="vertical-align:middle;font-size:7pt;color:#666;text-align:center;white-space:nowrap" contenteditable="true">${r.notes||"-"}</td>
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

  table { width:100%; border-collapse:collapse; font-size:7.5pt; table-layout:fixed; }
  th { background:#155855; color:#fff; font-weight:900; padding:6px 5px; text-align:center; border:1px solid #0e3f3c; font-size:7.5pt; word-break:keep-all; line-height:1.3; }
  td { padding:5px 6px; border:1px solid #e5e7eb; vertical-align:middle; line-height:1.45; word-break:keep-all; overflow-wrap:break-word; white-space:normal; }

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
    @page { margin:6mm 8mm; size: A4 landscape; }
    @page:first { size: A4 portrait; }
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
        <th style="width:55px">진료과</th>
        <th style="width:36px">소요<br/>시간</th>
        <th style="width:48px">장소</th>
        <th style="width:82px">카메라 구도</th>
        <th style="width:65px">키워드</th>
        <th>설명</th>
        <th style="width:90px">필요인원/환자역할</th>
        <th style="width:38px">비고</th>
      </tr>
    </thead>
    <tbody>${contiRows}</tbody>
  </table>
</div>

<!-- ③ 준비 체크리스트 -->
<div class="page-break" style="page-break-before:always"></div>
<style>@page { size: A4 portrait; }</style>
${header("준비 체크리스트")}
<div class="section">
  <p class="section-meta">총 ${result.checklist.length}개 항목</p>
  <table>
    <thead>
      <tr>
        <th style="width:26px">#</th>
        <th style="width:80px">분류</th>
        <th>체크리스트 항목</th>
        <th style="width:40px">준비<br/>여부</th>
        <th style="width:55px">비고</th>
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
        <th style="width:95px">시간</th>
        <th style="width:100px">내용</th>
        <th style="width:45px">구분</th>
        <th>요청사항</th>
        <th style="width:45px">비고</th>
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
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                  {/* PDF 불러오기 */}
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                    style={{ display: "none" }}
                    onChange={handlePdfImport}
                  />
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    disabled={pdfLoading}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      padding: "0 18px", minHeight: 42,
                      border: "1.5px solid #7c3aed",
                      borderRadius: 8, background: pdfLoading ? "#f5f3ff" : "#fff",
                      color: "#7c3aed", fontWeight: 800, fontSize: 14,
                      cursor: pdfLoading ? "not-allowed" : "pointer",
                      transition: "all 160ms ease", opacity: pdfLoading ? 0.7 : 1,
                    }}
                  >
                    <FileUp size={16} /> {pdfLoading ? "파일 인식 중..." : "PDF / 이미지 불러오기"}
                  </button>
                  {pdfError && (
                    <div style={{ width: "100%", fontSize: 12, color: "#dc2626", padding: "6px 10px", background: "#fff0f0", borderRadius: 6, border: "1px solid #fecaca" }}>
                      ⚠️ {pdfError}
                    </div>
                  )}
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
                    <input value={form.hospitalName} onChange={e => set("hospitalName", e.target.value)} placeholder="예: 포토클리닉" required />
                  </label>
                  <div className="field">
                    <span>진료과목 * (복수 선택 가능)</span>
                    <SpecialtyPicker selected={form.specialties} onChange={v => set("specialties", v)} />
                  </div>
                  <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
                    <div key={i} className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "180px 80px 1fr 36px", gap: 8, alignItems: "center" }}>
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
                    <div key={i} className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "220px 80px 1fr 36px", gap: 8, alignItems: "center" }}>
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
                <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 36px", gap: 8, marginBottom: 6 }}>
                  {["층/구역", "공간 목록", "비고", ""].map((h, i) => <span key={i} style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af" }}>{h}</span>)}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {form.locationItems.length === 0 && <EmptyRow />}
                  {form.locationItems.map((item, i) => (
                    <div key={i} className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 36px", gap: 8, alignItems: "center" }}>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={resultTitle}
                    onChange={e => setResultTitle(e.target.value)}
                    placeholder="제목 입력 (예: 포토클리닉 촬영 콘티)"
                    style={{
                      fontSize: 28, fontWeight: 800, color: "var(--deep-green)",
                      fontFamily: "inherit",
                      border: "none", borderBottom: "2px solid transparent", background: "transparent",
                      outline: "none", padding: "0 4px",
                      width: "100%", display: "block",
                    }}
                    onFocus={e => (e.target.style.borderBottomColor = "var(--deep-green)")}
                    onBlur={e => (e.target.style.borderBottomColor = "transparent")}
                  />
                  <Pencil size={14} style={{ color: "#9ca3af", opacity: 0.5, flexShrink: 0 }} />
                </div>
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
                <button
                  onClick={handleShare}
                  disabled={shareLoading}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "0 18px", minHeight: 42,
                    border: `1px solid ${shareCopied ? "#16a34a" : "#0284c7"}`,
                    borderRadius: 8, background: shareCopied ? "#f0fdf4" : "#f0f9ff",
                    color: shareCopied ? "#16a34a" : "#0284c7",
                    fontWeight: 900, fontSize: 14,
                    cursor: shareLoading ? "not-allowed" : "pointer",
                    opacity: shareLoading ? 0.7 : 1,
                  }}
                >
                  <Link2 size={16} />
                  {shareLoading ? "링크 생성 중..." : shareCopied ? "링크 복사됨!" : "현장뷰 공유"}
                </button>
                <button
                  onClick={() => result && generateSceneImages(result.conti)}
                  disabled={generatingImages}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "0 18px", minHeight: 42, border: "1px solid #E85D2C",
                    borderRadius: 8, background: generatingImages ? "#fff0eb" : "#fff7f5",
                    color: "#E85D2C", fontWeight: 900, fontSize: 14,
                    cursor: generatingImages ? "not-allowed" : "pointer", opacity: generatingImages ? 0.7 : 1,
                  }}
                >
                  {generatingImages ? "🎨 이미지 생성 중..." : "🎨 씬 이미지 생성"}
                </button>
                <button onClick={handleSaveJSON} disabled={saveLoading} style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "0 18px", minHeight: 42, border: "1.5px dashed rgba(21,88,85,0.4)",
                  borderRadius: 8, background: "#fff", color: "#155855",
                  fontWeight: 900, fontSize: 14, cursor: saveLoading ? "not-allowed" : "pointer",
                  opacity: saveLoading ? 0.7 : 1,
                }}>
                  <FileText size={16} /> {saveLoading ? "저장 중..." : "콘티 저장"}
                </button>
                <div style={{
                  minHeight: 42, display: "flex", flexDirection: "column", justifyContent: "center",
                  padding: "0 12px", borderRadius: 8, background: "#F0F9F8",
                  border: "1px solid rgba(21,88,85,0.12)", color: "#155855",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 900 }}>
                    {autoSaveState === "saving" ? "자동 저장 중..." : autoSaveState === "saved" ? "자동 저장됨" : autoSaveState === "error" ? "자동 저장 실패" : "자동 저장 대기"}
                  </div>
                  <div style={{ fontSize: 10, color: "#5A7470", marginTop: 2 }}>
                    ⌘S 저장 · ⌘Z 되돌리기 · ⇧⌘Z 다시 복귀
                  </div>
                </div>
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

            {/* 이미지 오류 */}
            {imageError && (
              <div style={{ padding: "8px 12px", background: "#fff0f0", border: "1px solid #fcccc", borderRadius: 8, fontSize: 12, color: "#dc2626", marginBottom: 8 }}>
                씬 이미지 생성 오류: {imageError}
              </div>
            )}
            {/* 공유 URL 배너 */}
            {shareUrl && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "#f0f9ff", border: "1px solid #bae6fd",
                borderRadius: 8, padding: "10px 14px", fontSize: 13,
                marginBottom: 12, flexWrap: "wrap",
              }}>
                <Link2 size={15} color="#0284c7" />
                <span style={{ color: "#0284c7", fontWeight: 700 }}>공유 링크:</span>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#0284c7", textDecoration: "underline", wordBreak: "break-all", flex: 1 }}>
                  {shareUrl}
                </a>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl);
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  }}
                  style={{
                    padding: "4px 12px", border: "1px solid #0284c7",
                    borderRadius: 6, background: "#fff", color: "#0284c7",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}>
                  복사
                </button>
              </div>
            )}
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
                { key: "scenes",    label: "촬영 씬(참고용)",  Icon: ImageIcon },
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
                        {["", "씬", "진료과", "소요시간", "장소", "카메라 구도", "키워드", "설명", "필요인원 / 환자역할", "비고", ""].map((h, idx) => (
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
                            <td style={{ ...TD, width: 80, padding: "4px" }}>
                              {i < 10 && sceneImages[String(i)] ? (
                                <img
                                  src={sceneImages[String(i)]}
                                  alt={`씬${i+1}`}
                                  style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 6, display: "block" }}
                                />
                              ) : i < 10 && generatingImages ? (
                                <div style={{ width: 72, height: 54, borderRadius: 6, background: "rgba(21,88,85,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                                  🎨
                                </div>
                              ) : (
                                <div style={{ width: 72, height: 54, borderRadius: 6, background: "rgba(21,88,85,0.04)", border: "1px dashed rgba(21,88,85,0.15)" }} />
                              )}
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
              {/* ══ 씬 참고 탭 ══ */}
              {tab === "scenes" && result && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#5A7470" }}>
                      촬영 씬 구성 한눈에 보기 — 총 {result.conti.length}컷
                    </div>
                    <button
                      onClick={() => {
                        const sceneList = result.conti.map((r, i) =>
                          "씬" + (i+1) + ". [" + r.category + "] " + r.location + " / " + r.keyword + " / " + r.duration + "\n  설명: " + r.description + "\n  인원: " + r.personnel
                        ).join("\n\n");
                        const prompt = [
                          "아래 병원 촬영 콘티를 보고, 각 씬을 일러스트 스타일의 스토리보드로 그려주세요.",
                          "",
                          "스타일:",
                          "- 수채화 스케치 일러스트",
                          "- 따뜻한 베이지/화이트 톤",
                          "- 한국 병원 환경, 전문적이고 친근한 분위기",
                          "- 씬 번호와 제목 포함",
                          "- 진료과별로 행을 구분한 가로형 스토리보드 한 장",
                          "",
                          "씬 목록:",
                          sceneList
                        ].join("\n");
                        navigator.clipboard.writeText(prompt);
                        alert("✅ ChatGPT 프롬프트 복사 완료! ChatGPT에 붙여넣기 하세요.");
                      }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "0 16px", height: 36, borderRadius: 8,
                        border: "1.5px solid #155855", background: "#EAF4F2",
                        color: "#155855", fontWeight: 900, fontSize: 12,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      📋 ChatGPT 프롬프트 복사
                    </button>
                  </div>
                  {/* 진료과별 그룹 */}
                  {(() => {
                    const groups: Record<string, { row: typeof result.conti[0]; idx: number }[]> = {};
                    result.conti.forEach((row, idx) => {
                      const cat = row.category || "기타";
                      if (!groups[cat]) groups[cat] = [];
                      groups[cat].push({ row, idx });
                    });
                    return Object.entries(groups).map(([cat, items]) => (
                      <div key={cat} style={{ marginBottom: 28 }}>
                        {/* 진료과 헤더 */}
                        <div style={{
                          display: "inline-flex", alignItems: "center",
                          background: "#155855", color: "#fff",
                          padding: "4px 14px", borderRadius: 6,
                          fontSize: 12, fontWeight: 900, marginBottom: 12,
                        }}>{cat}</div>
                        {/* 씬 카드 그리드 */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                          {items.map(({ row, idx }) => (
                            <div key={idx} style={{
                              background: "#fff", border: "1px solid rgba(21,88,85,.1)",
                              borderRadius: 12, overflow: "hidden",
                              boxShadow: "0 1px 6px rgba(0,0,0,.05)",
                            }}>
                              {/* 이미지 or 컬러바 */}
                              {sceneImages[String(idx)] ? (
                                <div style={{ position: "relative" }}>
                                  <img src={sceneImages[String(idx)]} alt={`씬${idx+1}`} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                                  <div style={{ position: "absolute", top: 6, left: 6, background: "#E85D2C", color: "#fff", fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 4 }}>씬 {idx+1}</div>
                                  <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 9, padding: "2px 7px", borderRadius: 4 }}>⏱ {row.duration}</div>
                                </div>
                              ) : (
                                <div style={{
                                  background: "linear-gradient(135deg,#155855,#1e7870)",
                                  padding: "10px 12px",
                                  display: "flex", justifyContent: "space-between", alignItems: "center",
                                }}>
                                  <span style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,.7)", letterSpacing: ".1em" }}>씬 {String(idx + 1).padStart(2, "0")}</span>
                                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.8)" }}>⏱ {row.duration}</span>
                                </div>
                              )}
                              {/* 씬 내용 */}
                              <div style={{ padding: "10px 12px" }}>
                                <div style={{ fontSize: 13, fontWeight: 900, color: "#E85D2C", marginBottom: 4, lineHeight: 1.3 }}>
                                  {row.keyword}
                                </div>
                                <div style={{ fontSize: 11, color: "#374151", marginBottom: 6, lineHeight: 1.5 }}>
                                  {row.description?.slice(0, 60)}{(row.description?.length || 0) > 60 ? "..." : ""}
                                </div>
                                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                                  <div style={{ fontSize: 10, color: "#6b7280" }}>📍 {row.location}</div>
                                  <div style={{ fontSize: 10, color: "#6b7280" }}>👥 {row.personnel?.slice(0, 40)}{(row.personnel?.length || 0) > 40 ? "..." : ""}</div>
                                  {row.cameraAngle && <div style={{ fontSize: 10, color: "#6b7280" }}>📷 {row.cameraAngle?.slice(0, 30)}</div>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

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
          <div style={{ position: "fixed", inset: 0, background: "#EDF5F3", zIndex: 200, overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* 현장 뷰 헤더 */}
            <div style={{
              flexShrink: 0, zIndex: 310,
              background: "#155855", padding: "14px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              boxShadow: "0 2px 12px rgba(21,88,85,0.15)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>📋</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#fff", fontWeight: 900, fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resultTitle}</div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 1 }}>{form.specialties.join(" · ")}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                <button onClick={handlePDF} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "8px 16px", border: "1.5px solid rgba(255,255,255,0.35)",
                  borderRadius: 10, background: "rgba(255,255,255,0.12)", color: "#fff",
                  fontWeight: 800, fontSize: 13, cursor: "pointer"
                }}>📄 PDF</button>
                <button onClick={() => {
                  if (drawMode) {
                    const c = drawCanvasRef.current;
                    if (c) tempDrawingRef.current = c.toDataURL();
                  }
                  setDrawMode(d => !d); setIsEraser(false);
                }} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "8px 16px", border: `1.5px solid ${drawMode ? "#E85D2C" : "rgba(255,255,255,0.35)"}`,
                  borderRadius: 10, background: drawMode ? "#E85D2C" : "rgba(255,255,255,0.12)", color: "#fff",
                  fontWeight: 800, fontSize: 13, cursor: "pointer"
                }}>✏️ {drawMode ? "그리기 중" : "펜 도구"}</button>
                {/* 드로잉 저장 버튼 */}
                <button onClick={saveDrawing} disabled={drawSaveState === "saving"} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "8px 16px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: drawSaveState === "saving" ? "not-allowed" : "pointer",
                  border: `1.5px solid ${drawSaveState === "saved" ? "#4CAF50" : drawSaveState === "error" ? "#FF5555" : "rgba(255,255,255,0.35)"}`,
                  background: drawSaveState === "saved" ? "rgba(76,175,80,0.25)" : drawSaveState === "error" ? "rgba(255,85,85,0.2)" : "rgba(255,255,255,0.12)",
                  color: "#fff",
                }}>
                  {drawSaveState === "saving" ? "⏳ 저장 중" : drawSaveState === "saved" ? "✓ 저장됨" : drawSaveState === "error" ? "✕ 실패" : "💾 저장"}
                </button>
                <button
                  onClick={handleShare}
                  disabled={shareLoading}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "8px 16px",
                    border: `1.5px solid ${shareCopied ? "#4CAF50" : "rgba(255,255,255,0.35)"}`,
                    borderRadius: 10,
                    background: shareCopied ? "rgba(76,175,80,0.25)" : "rgba(255,255,255,0.12)",
                    color: "#fff", fontWeight: 800, fontSize: 13,
                    cursor: shareLoading ? "not-allowed" : "pointer",
                  }}>
                  <Link2 size={14} />
                  {shareLoading ? "생성 중" : shareCopied ? "링크 복사됨!" : "링크 공유"}
                </button>
                <button onClick={() => { setFieldView(false); setDrawMode(false); clearCanvas(); tempDrawingRef.current = null; }} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", border: "1.5px solid rgba(255,255,255,0.35)",
                  borderRadius: 10, background: "rgba(255,255,255,0.12)", color: "#fff",
                  fontWeight: 800, fontSize: 13, cursor: "pointer"
                }}>✕ 편집 모드로</button>
              </div>
            </div>

            {/* ── 드로잉 캔버스 오버레이 ── */}
            {drawMode && (
              <>
                <canvas
                  ref={drawCanvasRef}
                  style={{
                    position: "fixed", top: 72, left: 0, right: 0, bottom: 0,
                    width: "100%", height: "calc(100% - 72px)",
                    zIndex: 305, cursor: isEraser ? "cell" : "crosshair",
                    touchAction: "none",
                  }}
                  onMouseDown={startDraw}
                  onMouseMove={continueDraw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={continueDraw}
                  onTouchEnd={stopDraw}
                />
                {/* 드로잉 툴바 */}
                <div style={{
                  position: "fixed", bottom: 70, left: "50%", transform: "translateX(-50%)",
                  zIndex: 320, background: "rgba(12,26,25,0.97)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 20, padding: "12px 16px",
                  display: "flex", flexDirection: "column", gap: 10,
                  boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(16px)", minWidth: 320,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      {PEN_TYPES.map(({ key, label, icon }) => (
                        <button key={key} title={label} onClick={() => { setPenType(key as "pen"|"marker"|"highlighter"|"brush"); setIsEraser(false); }} style={{
                          height: 34, padding: "0 10px", borderRadius: 10,
                          background: !isEraser && penType === key ? "#155855" : "rgba(255,255,255,0.08)",
                          border: `2px solid ${!isEraser && penType === key ? "#E85D2C" : "rgba(255,255,255,0.2)"}`,
                          color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 4, transition: "all 120ms", whiteSpace: "nowrap",
                        }}>{icon} {label}</button>
                      ))}
                    </div>
                    <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {[2, 4, 8].map(size => (
                        <button key={size} title={`굵기 ${size}`} onClick={() => setPenSize(size)} style={{
                          width: size + 16, height: size + 16, borderRadius: "50%",
                          background: penSize === size ? "#fff" : "rgba(255,255,255,0.25)",
                          border: penSize === size ? "2px solid #E85D2C" : "2px solid transparent",
                          cursor: "pointer", flexShrink: 0, transition: "all 120ms",
                        }} />
                      ))}
                    </div>
                    <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
                    <button onClick={() => setIsEraser(e => !e)} title="지우개" style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: isEraser ? "#E85D2C" : "rgba(255,255,255,0.1)",
                      border: `2px solid ${isEraser ? "#E85D2C" : "rgba(255,255,255,0.2)"}`,
                      color: "#fff", fontSize: 15, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>🧹</button>
                    <button onClick={async () => {
                      clearCanvas();
                      const hospital = form.hospitalName || resultTitle;
                      if (hospital) await fetch(`/api/conti-drawing?hospital=${encodeURIComponent(hospital)}`, { method: "DELETE" });
                    }} title="전체 지우기 (저장 데이터도 삭제)" style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.2)",
                      color: "#fff", fontSize: 15, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>🗑️</button>
                    <button onClick={() => {
                      const c = drawCanvasRef.current;
                      if (c) tempDrawingRef.current = c.toDataURL();
                      setDrawMode(false);
                    }} title="펜 도구 닫기" style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: "rgba(232,93,44,0.2)", border: "2px solid rgba(232,93,44,0.5)",
                      color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>✕</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 5 }}>
                    {DRAW_COLORS.map(({ color, label }) => (
                      <button key={color} title={label} onClick={() => { setPenColor(color); setIsEraser(false); }} style={{
                        width: "100%", aspectRatio: "1", borderRadius: "50%", background: color, cursor: "pointer",
                        border: `3px solid ${!isEraser && penColor === color ? "#fff" : "rgba(255,255,255,0.15)"}`,
                        boxShadow: !isEraser && penColor === color ? `0 0 0 2px #E85D2C, 0 0 8px ${color}` : "none",
                        transition: "all 120ms", outline: "none",
                      }} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── 탭 콘텐츠 영역 ── */}
            <div style={{
              flex: 1, overflowY: "auto", padding: "20px 20px 12px",
              WebkitOverflowScrolling: "touch",
            }}>

              {/* 🎬 콘티 탭 — 시간순(duration 누적) 정렬 + 완료 체크 */}
              {fieldViewTab === "conti" && (() => {
                const parseMins = (d: string) => parseInt(d?.replace(/[^0-9]/g, "") || "0", 10) || 0;
                const sorted = result.conti
                  .map((row, origIdx) => ({ row, origIdx }))
                  .sort((a, b) => parseMins(a.row.duration) - parseMins(b.row.duration) || a.origIdx - b.origIdx);
                const doneCount = doneConti.size;
                return (
                  <div>
                    {/* 진행률 바 */}
                    <div style={{ marginBottom: 16, background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1px solid #C8DDD9", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ flex: 1, background: "#EDF5F3", borderRadius: 99, height: 8, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${result.conti.length ? (doneCount / result.conti.length) * 100 : 0}%`, background: "#155855", borderRadius: 99, transition: "width 300ms" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#155855", whiteSpace: "nowrap" }}>
                        {doneCount} / {result.conti.length} 완료
                      </span>
                      {doneCount > 0 && (
                        <button onClick={() => setDoneConti(new Set())} style={{ fontSize: 11, color: "#9BB5B0", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>초기화</button>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                      {sorted.map(({ row, origIdx }, sortedIdx) => {
                        const rawColor = row.color ? row.color.split("|") : null;
                        const c = rawColor ? { bg: rawColor[0], text: rawColor[1] } : getColor(row.category);
                        const isDraggingOver = dragOver?.type === "conti" && dragOver.index === origIdx;
                        const isDone = doneConti.has(origIdx);
                        return (
                          <div key={origIdx}
                            draggable
                            data-conti-index={origIdx}
                            onDragStart={() => handleDragStart("conti", origIdx)}
                            onDragOver={e => handleDragOver(e, "conti", origIdx)}
                            onDrop={() => handleDrop("conti", origIdx)}
                            onDragEnd={handleDragEnd}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              touchDragRef.current = origIdx;
                              handleDragStart("conti", origIdx);
                            }}
                            onTouchMove={(e) => {
                              e.preventDefault();
                              const touch = e.touches[0];
                              const el = document.elementFromPoint(touch.clientX, touch.clientY);
                              const card = el?.closest("[data-conti-index]") as HTMLElement | null;
                              if (card) {
                                const idx = parseInt(card.getAttribute("data-conti-index") || "-1");
                                if (idx >= 0 && idx !== touchDragRef.current) setDragOver({ type: "conti", index: idx });
                              }
                            }}
                            onTouchEnd={() => {
                              if (touchDragRef.current !== null && dragOver?.type === "conti") {
                                handleDrop("conti", dragOver.index);
                              }
                              touchDragRef.current = null;
                              setDragOver(null);
                            }}
                            style={{
                              background: isDone ? "#F0FDF4" : "#fff",
                              borderRadius: 16,
                              border: isDraggingOver ? "2px dashed #155855" : isDone ? "1px solid #86EFAC" : "1px solid #C8DDD9",
                              overflow: "hidden",
                              boxShadow: isDraggingOver ? "0 0 0 3px rgba(21,88,85,0.15)" : "0 2px 14px rgba(21,88,85,0.08)",
                              cursor: "grab", opacity: isDraggingOver ? 0.7 : isDone ? 0.72 : 1,
                              transition: "all 200ms",
                              touchAction: "none",
                            }}
                          >
                            {/* 카드 헤더 */}
                            <div style={{
                              background: isDone ? "#DCFCE7" : c.bg, padding: "11px 16px",
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: isDone ? "#166534" : c.text, fontSize: 14, opacity: 0.5, marginRight: 2, cursor: "grab" }}>⠿</span>
                                <span style={{ background: "rgba(0,0,0,0.12)", color: isDone ? "#166534" : c.text, fontSize: 11, fontWeight: 900, padding: "2px 9px", borderRadius: 99 }}>
                                  {sortedIdx + 1}순위
                                </span>
                                <span style={{ color: isDone ? "#166534" : c.text, fontWeight: 900, fontSize: 14 }}>{row.category}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ background: "rgba(0,0,0,0.10)", color: isDone ? "#166534" : c.text, fontSize: 11, fontWeight: 800, padding: "3px 11px", borderRadius: 99 }}>⏱ {row.duration}</span>
                                {/* 완료 체크박스 */}
                                <label onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                                  <input
                                    type="checkbox"
                                    checked={isDone}
                                    onChange={() => toggleDone(origIdx)}
                                    style={{ width: 18, height: 18, accentColor: "#155855", cursor: "pointer" }}
                                  />
                                  <span style={{ fontSize: 11, fontWeight: 800, color: isDone ? "#166534" : "rgba(0,0,0,0.35)" }}>
                                    {isDone ? "완료 ✓" : "완료"}
                                  </span>
                                </label>
                              </div>
                            </div>
                            {/* 카드 바디 */}
                            <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
                              <div style={{ color: isDone ? "#15803D" : "#E85D2C", fontWeight: 900, fontSize: 15, textDecoration: isDone ? "line-through" : "none" }}>{row.keyword}</div>
                              <p style={{ color: isDone ? "#6B7280" : "#3A5450", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                                {row.description}
                              </p>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 2 }}>
                                <div style={{ background: "#EDF5F3", borderRadius: 9, padding: "8px 12px" }}>
                                  <div style={{ color: "#7A9E9B", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>📍 장소</div>
                                  <div style={{ color: "#1C2B28", fontSize: 13, fontWeight: 700 }}>{row.location || "—"}</div>
                                </div>
                                <div style={{ background: "#EDF5F3", borderRadius: 9, padding: "8px 12px" }}>
                                  <div style={{ color: "#7A9E9B", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>📷 구도</div>
                                  <div style={{ color: "#1C2B28", fontSize: 13, fontWeight: 700 }}>{row.cameraAngle || "—"}</div>
                                </div>
                                <div style={{ background: "#EDF5F3", borderRadius: 9, padding: "8px 12px", gridColumn: "1/-1" }}>
                                  <div style={{ color: "#7A9E9B", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>👥 필요인원</div>
                                  <div style={{ color: "#1C2B28", fontSize: 13 }}>{row.personnel || "—"}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ✅ 체크리스트 탭 */}
              {fieldViewTab === "checklist" && (
                <div style={{ display: "grid", gap: 10, maxWidth: 700, margin: "0 auto" }}>
                  {result.checklist.map((row, i) => (
                    <label key={i} style={{
                      display: "flex", alignItems: "center", gap: 14,
                      background: "#fff", borderRadius: 12, padding: "14px 18px",
                      cursor: "pointer", userSelect: "none",
                      border: "1px solid #C8DDD9",
                      boxShadow: "0 1px 6px rgba(21,88,85,0.06)",
                    }}>
                      <input type="checkbox" style={{ width: 22, height: 22, accentColor: "#155855", cursor: "pointer", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ color: "#7A9E9B", fontSize: 11, fontWeight: 700 }}>{row.category} · </span>
                        <span style={{ color: "#1C2B28", fontSize: 14, fontWeight: 700 }}>{row.item}</span>
                        {row.notes && <span style={{ color: "#9BB5B0", fontSize: 12, marginLeft: 6 }}>({row.notes})</span>}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* ⏰ 타임테이블 탭 — 시간순 정렬 */}
              {fieldViewTab === "schedule" && (
                <div style={{ display: "grid", gap: 10, maxWidth: 700, margin: "0 auto" }}>
                  {[...result.schedule].sort((a, b) => {
                    const toMins = (t: string) => {
                      const m = t?.match(/(\d{1,2}):(\d{2})/);
                      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 9999;
                    };
                    return toMins(a.time) - toMins(b.time);
                  }).map((row, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "stretch",
                      background: "#fff", borderRadius: 12, overflow: "hidden",
                      border: "1px solid #C8DDD9",
                      boxShadow: "0 1px 6px rgba(21,88,85,0.06)",
                    }}>
                      <div style={{
                        background: "#155855", padding: "14px 18px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        minWidth: 100, flexShrink: 0,
                      }}>
                        <span style={{ color: "#fff", fontWeight: 900, fontSize: 14 }}>{row.time}</span>
                      </div>
                      <div style={{ padding: "14px 18px", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ color: "#1C2B28", fontWeight: 800, fontSize: 15 }}>{row.activity}</span>
                          {row.type && <span style={{ color: "#E85D2C", fontSize: 11, fontWeight: 700, background: "rgba(232,93,44,0.1)", padding: "2px 8px", borderRadius: 99 }}>{row.type}</span>}
                        </div>
                        {row.requirements && <div style={{ color: "#5A7470", fontSize: 13 }}>{row.requirements}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── 하단 탭 바 ── */}
            <div style={{
              flexShrink: 0, height: 64,
              background: "#fff", borderTop: "1px solid #C8DDD9",
              display: "flex", zIndex: 312,
              boxShadow: "0 -2px 12px rgba(21,88,85,0.07)",
            }}>
              {([
                { key: "conti",     label: "콘티",   icon: "🎬", count: result.conti.length },
                { key: "checklist", label: "체크",   icon: "✅", count: result.checklist.length },
                { key: "schedule",  label: "일정",   icon: "⏰", count: result.schedule.length },
              ] as const).map(({ key, label, icon, count }) => (
                <button key={key} onClick={() => setFieldViewTab(key)} style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 3, border: "none", cursor: "pointer",
                  background: fieldViewTab === key ? "#EDF5F3" : "transparent",
                  borderTop: `3px solid ${fieldViewTab === key ? "#E85D2C" : "transparent"}`,
                  transition: "all 150ms",
                }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <span style={{ color: fieldViewTab === key ? "#155855" : "#9BB5B0", fontSize: 11, fontWeight: 800 }}>
                    {label} {count}
                  </span>
                </button>
              ))}
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

    {historyToast && (
      <div style={{
        position: "fixed", bottom: 154, left: "50%", transform: "translateX(-50%)",
        zIndex: 9999, background: "#1C2B28", color: "#fff",
        padding: "10px 20px", borderRadius: 12, fontSize: 13, fontWeight: 800,
        boxShadow: "0 8px 24px rgba(28,43,40,0.25)",
        animation: "fadeIn .2s ease"
      }}>
        {historyToast}
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
            {loadLoading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 }}>불러오는 중...</div>
            ) : savedList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 }}>
                저장된 콘티가 없어요<br />
                <span style={{ fontSize: 12 }}>콘티 생성 후 "콘티 저장" 버튼을 눌러주세요</span>
              </div>
            ) : savedList.map(entry => (
              <div key={entry.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", borderRadius: 10, marginBottom: 8,
                border: "1px solid rgba(21,88,85,0.12)", background: "#fafaf9",
                cursor: editingId === entry.id ? "default" : "pointer", transition: "all 120ms ease"
              }}
                onMouseEnter={e => { if (editingId !== entry.id) e.currentTarget.style.background = "rgba(21,88,85,0.05)"; }}
                onMouseLeave={e => (e.currentTarget.style.background = "#fafaf9")}
                onClick={() => { if (editingId !== entry.id) loadConti(entry); }}
              >
                <div style={{ fontSize: 28, flexShrink: 0 }}>🎬</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === entry.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={() => renameConti(entry.id, editingName)}
                      onKeyDown={e => {
                        if (e.key === "Enter") renameConti(entry.id, editingName);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: "100%", fontSize: 15, fontWeight: 800, color: "#155855",
                        border: "2px solid #155855", borderRadius: 6, padding: "4px 8px",
                        outline: "none", background: "#fff",
                      }}
                    />
                  ) : (
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#155855", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.hospital_name}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {entry.specialties?.join(" · ")} &nbsp;·&nbsp; {new Date(entry.saved_at).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                    {entry.result.conti.length}컷 · 체크 {entry.result.checklist.length}개
                  </div>
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setEditingId(entry.id);
                    setEditingName(entry.hospital_name);
                  }}
                  style={{ background: "none", border: "none", color: "#155855", cursor: "pointer", padding: 6, borderRadius: 6, flexShrink: 0, opacity: 0.5 }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
                  title="이름 수정"
                >
                  <Pencil size={14} />
                </button>
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
