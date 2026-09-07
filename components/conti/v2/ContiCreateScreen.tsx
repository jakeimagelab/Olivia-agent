"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { generateContiDraft, type GenerateContiInput, type HospitalSpaceRow, type HospitalStaffRow } from "@/lib/conti/generate";
import { buildCodeSceneTemplates, CONTI_DEPARTMENT_LIST, getDepartmentDefinition } from "@/lib/conti/departmentTaxonomy";

interface ClientOption { id: string; name: string }

export interface ContiCreateScreenProps {
  onGenerated: (runId: string) => void;
  initialClientId?: string;
  workflowRunId?: string;
  resourceId?: string;
}

const emptyStaff = { siljang: false, jikwon: false, other: false };

export default function ContiCreateScreen({ onGenerated, initialClientId, workflowRunId, resourceId }: ContiCreateScreenProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [hospitalId, setHospitalId] = useState(initialClientId ?? "");
  const [specialty, setSpecialty] = useState("");
  const [doctorCount, setDoctorCount] = useState(1);
  const [staffFlags, setStaffFlags] = useState(emptyStaff);
  const [otherStaffRole, setOtherStaffRole] = useState("");
  const [harmony, setHarmony] = useState(false);
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [extraItems, setExtraItems] = useState<string[]>([]);
  const [extraDraft, setExtraDraft] = useState("");
  const [hospitalSpaces, setHospitalSpaces] = useState<HospitalSpaceRow[]>([]);
  const [hospitalStaff, setHospitalStaff] = useState<HospitalStaffRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/clients").then((response) => response.json()).then((data) => {
      if (data.ok) setClients((data.clients ?? []).map((client: { id: string; hospital_name?: string }) => ({ id: client.id, name: client.hospital_name || "(이름 없음)" })));
    }).catch(() => {});
  }, []);

  useEffect(() => { if (initialClientId) setHospitalId(initialClientId); }, [initialClientId]);

  useEffect(() => {
    if (!hospitalId) { setHospitalSpaces([]); setHospitalStaff([]); return; }
    fetch(`/api/conti/hospital-profile?hospitalId=${encodeURIComponent(hospitalId)}`)
      .then((response) => response.json())
      .then((data) => { if (data.ok) { setHospitalSpaces(data.spaces ?? []); setHospitalStaff(data.staff ?? []); } })
      .catch(() => {});
  }, [hospitalId]);

  const department = useMemo(() => getDepartmentDefinition(specialty), [specialty]);
  const templates = useMemo(() => buildCodeSceneTemplates(specialty), [specialty]);
  const input: GenerateContiInput = useMemo(() => ({ specialty, doctorCount, staffFlags, otherStaffRole, harmony, checked, extraItems }), [specialty, doctorCount, staffFlags, otherStaffRole, harmony, checked, extraItems]);
  const draft = useMemo(() => specialty ? generateContiDraft(input, { templates, hospitalSpaces, hospitalStaff }) : null, [specialty, input, templates, hospitalSpaces, hospitalStaff]);
  const totalMinutes = draft?.scenes.reduce((sum, scene) => sum + (scene.minutes ?? 0), 0) ?? 0;

  function selectDepartment(value: string) { setSpecialty(value); setChecked({}); setOpenGroups(new Set()); }

  function toggleCategory(categoryId: string) {
    setChecked((previous) => {
      const next = { ...previous };
      if (Object.hasOwn(next, categoryId)) delete next[categoryId];
      else next[categoryId] = [];
      return next;
    });
    setOpenGroups((previous) => new Set(previous).add(categoryId));
  }

  function toggleDetail(categoryId: string, detail: string) {
    setChecked((previous) => {
      const current = previous[categoryId] ?? [];
      return { ...previous, [categoryId]: current.includes(detail) ? current.filter((item) => item !== detail) : [...current, detail] };
    });
  }

  function addExtraItem() {
    const value = extraDraft.trim();
    if (!value || extraItems.includes(value)) return;
    setExtraItems((previous) => [...previous, value]);
    setExtraDraft("");
  }

  async function handleGenerate() {
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/conti/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hospitalId: hospitalId || null, workflowRunId, resourceId, ...input }) });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error ?? "생성 실패");
      onGenerated(data.run.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "생성 실패"); }
    finally { setSubmitting(false); }
  }

  const selectedCategories = Object.keys(checked).length;
  const selectedDetails = Object.values(checked).reduce((sum, items) => sum + items.length, 0);
  const canGenerate = Boolean(specialty) && (selectedCategories > 0 || staffFlags.siljang || staffFlags.jikwon || (staffFlags.other && otherStaffRole.trim()) || harmony || extraItems.length > 0) && !submitting;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 18, alignItems: "start" }}>
      <main style={panelStyle}>
        <header><h2 style={{ margin: 0, fontSize: 18, color: "#fff" }}>콘티 만들기</h2><p style={{ margin: "5px 0 0", fontSize: 12, color: "rgba(255,255,255,.5)" }}>진료과와 촬영할 항목만 선택하면 장면을 자동 구성합니다.</p></header>

        <Field label="병원" optional><select value={hospitalId} onChange={(event) => setHospitalId(event.target.value)} style={inputStyle}><option value="">병원 선택 안 함</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
        <Field label="진료과"><select value={specialty} onChange={(event) => selectDepartment(event.target.value)} style={inputStyle}><option value="">진료과 선택</option>{CONTI_DEPARTMENT_LIST.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        <Field label="의료진 수"><div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" onClick={() => setDoctorCount((value) => Math.max(1, value - 1))} style={smallButton}>−</button><strong style={{ minWidth: 44, textAlign: "center", color: "#fff" }}>{doctorCount}명</strong><button type="button" onClick={() => setDoctorCount((value) => Math.min(10, value + 1))} style={smallButton}>+</button></div></Field>
        <Field label="직원 촬영"><div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}><Check label="실장" checked={staffFlags.siljang} onChange={() => setStaffFlags((value) => ({ ...value, siljang: !value.siljang }))} /><Check label="직원" checked={staffFlags.jikwon} onChange={() => setStaffFlags((value) => ({ ...value, jikwon: !value.jikwon }))} /><Check label="기타" checked={staffFlags.other} onChange={() => setStaffFlags((value) => ({ ...value, other: !value.other }))} /></div>{staffFlags.other ? <input value={otherStaffRole} onChange={(event) => setOtherStaffRole(event.target.value)} placeholder="역할 입력" style={inputStyle} /> : null}</Field>
        <Field label="하모니컷"><Check label="촬영" checked={harmony} onChange={() => setHarmony((value) => !value)} /></Field>

        <Field label="촬영항목">
          {!department ? <span style={hintStyle}>진료과를 먼저 선택하세요.</span> : <div style={{ display: "grid", gap: 7 }}>{department.categories.map((category) => {
            const selected = Object.hasOwn(checked, category.id); const open = openGroups.has(category.id);
            return <div key={category.id} style={{ border: "1px solid rgba(255,255,255,.11)", borderRadius: 9 }}><div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px" }}><input type="checkbox" checked={selected} onChange={() => toggleCategory(category.id)} aria-label={category.label} /><button type="button" onClick={() => setOpenGroups((previous) => { const next = new Set(previous); if (open) next.delete(category.id); else next.add(category.id); return next; })} style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", border: 0, background: "transparent", color: "#fff", fontWeight: 750, cursor: "pointer", textAlign: "left" }}>{category.label}<ChevronDown size={14} style={{ transform: open ? "none" : "rotate(-90deg)" }} /></button></div>{open && category.details.length > 0 ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "2px 12px 12px 34px" }}>{category.details.map((detail) => <Check key={detail} label={detail} checked={(checked[category.id] ?? []).includes(detail)} onChange={() => toggleDetail(category.id, detail)} />)}</div> : null}</div>;
          })}</div>}
        </Field>

        <Field label="기타 촬영항목" optional><div style={{ display: "flex", gap: 7 }}><input value={extraDraft} onChange={(event) => setExtraDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addExtraItem(); } }} placeholder="예: 장비 단독컷, 건물 외관" style={{ ...inputStyle, flex: 1 }} /><button type="button" onClick={addExtraItem} style={smallButton}><Plus size={14} /> 추가</button></div>{extraItems.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{extraItems.map((item) => <span key={item} style={tagStyle}>{item}<button type="button" onClick={() => setExtraItems((values) => values.filter((value) => value !== item))} aria-label={`${item} 삭제`} style={tagDeleteStyle}><Trash2 size={11} /></button></span>)}</div> : null}</Field>

        {error ? <p style={{ margin: 0, color: "#ff9a7b", fontSize: 12 }}>{error}</p> : null}
        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.1)" }}><span style={hintStyle}>대분류 {selectedCategories}개 · 세부 {selectedDetails}개</span><button type="button" disabled={!canGenerate} onClick={handleGenerate} style={{ ...primaryButton, opacity: canGenerate ? 1 : .45 }}><Sparkles size={14} />{submitting ? "생성 중…" : "AI 콘티 생성"}</button></footer>
      </main>

      <aside style={{ background: "#fff", border: "1px solid rgba(21,88,85,.12)", borderRadius: 14, padding: 20, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 800, color: "#5A7470" }}>예상 결과</div><div style={{ display: "flex", gap: 24, margin: "10px 0 16px", color: "#155855" }}><strong style={{ fontSize: 28 }}>{draft?.scenes.length ?? 0}장면</strong><strong style={{ fontSize: 28 }}>{totalMinutes}분</strong></div><div style={{ display: "grid", gap: 6, maxHeight: 520, overflowY: "auto" }}>{draft?.scenes.map((scene) => <div key={`${scene.sort}-${scene.name}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 9px", borderRadius: 7, background: "#F3F8F7", fontSize: 12 }}><strong>{scene.name}</strong><span style={{ color: "#5A7470" }}>{scene.minutes}분</span></div>)}{!draft?.scenes.length ? <span style={{ color: "#8ba09c", fontSize: 12 }}>선택한 내용으로 생성될 장면이 표시됩니다.</span> : null}</div></aside>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) { return <section style={{ display: "grid", gap: 8 }}><label style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>{label}{optional ? <span style={{ marginLeft: 6, color: "rgba(255,255,255,.4)", fontSize: 10 }}>선택</span> : null}</label>{children}</section>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) { return <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,.82)", fontSize: 12, cursor: "pointer" }}><input type="checkbox" checked={checked} onChange={onChange} />{label}</label>; }

const panelStyle: React.CSSProperties = { minWidth: 0, display: "grid", gap: 20, padding: "22px 24px", borderRadius: 14, background: "#292929", boxShadow: "0 14px 38px rgba(0,0,0,.15)" };
const inputStyle: React.CSSProperties = { width: "100%", height: 38, boxSizing: "border-box", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "#fff", padding: "0 10px", fontSize: 12.5 };
const smallButton: React.CSSProperties = { minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 8, border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.06)", color: "#fff", padding: "0 11px", cursor: "pointer" };
const primaryButton: React.CSSProperties = { minHeight: 38, display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, border: 0, background: "#E85D2C", color: "#fff", padding: "0 16px", fontWeight: 800, cursor: "pointer" };
const hintStyle: React.CSSProperties = { color: "rgba(255,255,255,.48)", fontSize: 11.5 };
const tagStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 99, background: "#155855", color: "#fff", padding: "5px 9px", fontSize: 11.5 };
const tagDeleteStyle: React.CSSProperties = { display: "flex", border: 0, background: "transparent", color: "inherit", padding: 0, cursor: "pointer" };
