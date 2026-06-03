"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CheckSquare, ChevronDown, ClipboardList,
  Clock, Download, FileSpreadsheet, FileText,
  Pencil, Plus, RotateCcw, Sparkles, Trash2, X, Zap
} from "lucide-react";

/* ════════════════════════════════════════
   프리셋
════════════════════════════════════════ */
const SPECIALTY_OPTIONS = [
  "소아청소년과", "이비인후과", "내과", "외과", "정형외과",
  "피부과", "성형외과", "안과", "치과", "한의원",
  "산부인과", "비뇨기과", "신경과", "신경외과", "정신건강의학과",
  "재활의학과", "가정의학과", "응급의학과", "영상의학과", "마취통증의학과",
  "혈액종양내과", "감염내과", "소화기내과", "순환기내과"
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
interface ContiRow     { category: string; duration: string; location: string; cameraAngle: string; keyword: string; description: string; personnel: string; notes: string; }
interface ChecklistRow { number: number; category: string; item: string; notes: string; }
interface ScheduleRow  { time: string; activity: string; type: string; requirements: string; notes: string; }
interface ContiResult  { conti: ContiRow[]; checklist: ChecklistRow[]; schedule: ScheduleRow[]; }

/* ════════════════════════════════════════
   색상
════════════════════════════════════════ */
const CAT_COLORS = [
  { key: "하모니",    bg: "#FEF3C7", text: "#92400E" },
  { key: "외래",     bg: "#FCE7F3", text: "#9D174D" },
  { key: "진료",     bg: "#FCE7F3", text: "#9D174D" },
  { key: "병동",     bg: "#EDE9FE", text: "#5B21B6" },
  { key: "인테리어", bg: "#F3F4F6", text: "#374151" }
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
    border: "1.5px solid var(--deep-green)", borderRadius: 4,
    padding: "4px 6px", background: "#fffef9", outline: "none",
    fontWeight: bold ? 900 : 400, color: color ?? "#374151"
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
      title="클릭하여 편집"
      style={{
        cursor: "text", minHeight: 24, padding: "3px 4px",
        borderRadius: 4, lineHeight: 1.6,
        fontWeight: bold ? 900 : 400, color: color ?? "#374151",
        transition: "background 100ms ease",
        whiteSpace: multiline ? "pre-line" : undefined,
        position: "relative"
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.background = "rgba(21,88,85,0.06)";
        (e.currentTarget as HTMLDivElement).style.outline = "1px dashed rgba(21,88,85,0.25)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
        (e.currentTarget as HTMLDivElement).style.outline = "none";
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
   진료과 멀티셀렉트
════════════════════════════════════════ */
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
  const searchParams = useSearchParams();

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
    const hospitalName = searchParams.get("hospitalName");
    const dept         = searchParams.get("dept");
    const shootDate    = searchParams.get("shootDate");
    const spaces       = searchParams.get("spaces");
    const doctors      = searchParams.get("doctors");
    const extras       = searchParams.get("extras");

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
  }, [searchParams]);
  const [result,           setResult]           = useState<ContiResult | null>(null);
  const [error,            setError]            = useState("");
  const [tab,              setTab]              = useState<"conti" | "checklist" | "schedule">("conti");
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

  /* ── PDF 다운로드 ── */
  const handlePDF = async () => {
    if (!printRef.current) return;
    const { default: html2canvas } = await import("html2canvas");
    const { default: jsPDF }       = await import("jspdf");
    const canvas  = await html2canvas(printRef.current, { scale: 1.5, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw  = pdf.internal.pageSize.getWidth();
    const ph  = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pw) / canvas.width;
    let y = 0;
    while (y < imgH) { if (y > 0) pdf.addPage(); pdf.addImage(imgData, "PNG", 0, -y, pw, imgH); y += ph; }
    pdf.save(`${form.hospitalName || "병원"}_촬영콘티_${tab}.pdf`);
  };

  /* ── 스프레드시트용 CSV 다운로드 ── */
  const handleSpreadsheetDownload = () => {
    if (!result) return;

    const csvCell = (value: string | number) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const toCsv = (rows: Array<Array<string | number>>) =>
      rows.map(row => row.map(csvCell).join(",")).join("\n");
    const downloadCsv = (name: string, rows: Array<Array<string | number>>) => {
      const blob = new Blob([`\uFEFF${toCsv(rows)}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${form.hospitalName || "병원"}_${name}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    };

    downloadCsv("촬영콘티", [
      ["진료과", "소요시간", "장소", "카메라 구도", "키워드", "설명", "필요인원/환자역할", "비고"],
      ...result.conti.map(r => [r.category, r.duration, r.location, r.cameraAngle, r.keyword, r.description, r.personnel, r.notes])
    ]);
    downloadCsv("준비체크리스트", [
      ["번호", "분류", "체크리스트", "준비여부", "비고"],
      ...result.checklist.map(r => [r.number, r.category, r.item, "", r.notes])
    ]);
    downloadCsv("타임테이블", [
      ["시간", "내용", "구분", "요청사항", "비고"],
      ...result.schedule.map(r => [r.time, r.activity, r.type, r.requirements, r.notes])
    ]);
  };

  /* ════════════════════════════════
     렌더
  ════════════════════════════════ */
  return (
    <div style={{ minHeight: "100vh", background: "var(--ivory)" }}>
      <header className="analyzer-header">
        <div className="brand-lockup">
          <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" />
          <span>Conti Generator</span>
        </div>
        <Link className="admin-secondary-link" href="/">
          <ArrowLeft size={17} />관리자 홈
        </Link>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 24px" }}>

        {/* ══ 입력 폼 ══ */}
        {!result && (
          <section>
            <div style={{ marginBottom: 32 }}>
              <p className="admin-kicker">병원 • 메디컬 성장 플랫폼</p>
              <h1 style={{ margin: 0, color: "var(--deep-green)", fontSize: "clamp(26px,5vw,44px)", fontWeight: 800 }}>촬영 콘티 자동 생성</h1>
              <p style={{ marginTop: 12, color: "#4d5b56", fontSize: 15, lineHeight: 1.75 }}>병원 정보를 입력하면 AI가 촬영 콘티 · 준비 체크리스트 · 타임테이블을 한 번에 생성합니다.</p>
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
                생성 후 셀을 클릭해 직접 수정할 수 있어요.
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
        {result && (
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
                <button onClick={handleSpreadsheetDownload} style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "0 18px", minHeight: 42, border: "1px solid #16a34a",
                  borderRadius: 8, background: "#f0fdf4", color: "#16a34a",
                  fontWeight: 900, fontSize: 14, cursor: "pointer"
                }}>
                  <FileSpreadsheet size={16} /> CSV 다운로드
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
              <Pencil size={13} /> 셀을 클릭하면 직접 수정할 수 있습니다
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
                        {["진료과", "소요시간", "장소", "카메라 구도", "키워드", "설명", "필요인원 / 환자역할", "비고", ""].map(h => (
                          <th key={h} style={{ ...TH, ...(h === "" ? { width: 36, background: "#0e3f3c" } : {}) }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.conti.map((row, i) => {
                        const c = getColor(row.category);
                        return (
                          <tr key={i}>
                            <td style={{ ...TD, background: c.bg, minWidth: 80 }}>
                              <EditableCell value={row.category} onChange={v => updateConti(i, "category", v)} bold color={c.text} />
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
                        {["번호", "분류", "체크리스트", "준비여부", "비고", ""].map(h => (
                          <th key={h} style={{ ...TH, ...(h === "" ? { width: 36, background: "#0e3f3c" } : {}) }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.checklist.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafaf9" }}>
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
                      ))}
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
                        {["시간", "내용", "구분", "요청사항", "비고", ""].map(h => (
                          <th key={h} style={{ ...TH, ...(h === "" ? { width: 36, background: "#0e3f3c" } : {}) }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.schedule.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafaf9" }}>
                          <td style={{ ...TD, minWidth: 120 }}><EditableCell value={row.time} onChange={v => updateSchedule(i, "time", v)} bold color="#155855" /></td>
                          <td style={{ ...TD, minWidth: 140 }}><EditableCell value={row.activity} onChange={v => updateSchedule(i, "activity", v)} bold /></td>
                          <td style={{ ...TD, minWidth: 80 }}><EditableCell value={row.type} onChange={v => updateSchedule(i, "type", v)} color="var(--orange)" /></td>
                          <td style={{ ...TD, minWidth: 160 }}><EditableCell value={row.requirements} onChange={v => updateSchedule(i, "requirements", v)} /></td>
                          <td style={{ ...TD, minWidth: 100 }}><EditableCell value={row.notes} onChange={v => updateSchedule(i, "notes", v)} placeholder="-" /></td>
                          <td style={{ ...TD, width: 36, padding: "6px 4px" }}>
                            <DeleteRowBtn onClick={() => delScheduleRow(i)} />
                          </td>
                        </tr>
                      ))}
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
                PDF는 현재 탭 기준, 엑셀은 3개 탭 전체를 저장합니다.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
