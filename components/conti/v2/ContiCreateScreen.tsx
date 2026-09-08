"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Check, ChevronDown, Clock3, Plus, Sparkles, Trash2 } from "lucide-react";
import { generateContiDraft, type GenerateContiInput, type HospitalSpaceRow, type HospitalStaffRow } from "@/lib/conti/generate";
import { buildCodeSceneTemplates, CONTI_DEPARTMENT_LIST, getDepartmentDefinition } from "@/lib/conti/departmentTaxonomy";
import styles from "@/components/conti/v2/ContiV2.module.css";

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
    <div className={styles.createLayout}>
      <div className={styles.formShell}>
        <main className={styles.formPanel}>
          <header className={styles.formHero}>
            <div>
              <span className={styles.eyebrow}>AI 콘티 자동 생성</span>
              <h2>필요한 촬영 장면만<br />선택해 주세요.</h2>
              <p>진료과와 참여 인원, 촬영 항목을 고르면 현장에서 바로 사용할 수 있는 순서로 자동 구성합니다.</p>
            </div>
            <div className={styles.heroMark}><Camera aria-hidden="true" size={27} strokeWidth={1.5} /></div>
          </header>

          <div className={styles.formBody}>
            <Field step="01" label="병원" optional><select aria-label="병원 선택" name="conti-hospital" value={hospitalId} onChange={(event) => setHospitalId(event.target.value)} className={styles.control}><option value="">병원 연결 없이 만들기</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
            <Field step="02" label="진료과"><select aria-label="진료과 선택" name="conti-specialty" value={specialty} onChange={(event) => selectDepartment(event.target.value)} className={styles.control}><option value="">진료과를 선택해 주세요</option>{CONTI_DEPARTMENT_LIST.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            <Field step="03" label="의료진 수"><div className={styles.stepper}><button type="button" aria-label="의료진 수 줄이기" onClick={() => setDoctorCount((value) => Math.max(1, value - 1))}>−</button><strong>{doctorCount}명</strong><button type="button" aria-label="의료진 수 늘리기" onClick={() => setDoctorCount((value) => Math.min(10, value + 1))}>+</button></div></Field>
            <Field step="04" label="직원 촬영"><div className={styles.choiceRow}><Choice label="실장" checked={staffFlags.siljang} onChange={() => setStaffFlags((value) => ({ ...value, siljang: !value.siljang }))} /><Choice label="직원" checked={staffFlags.jikwon} onChange={() => setStaffFlags((value) => ({ ...value, jikwon: !value.jikwon }))} /><Choice label="기타" checked={staffFlags.other} onChange={() => setStaffFlags((value) => ({ ...value, other: !value.other }))} /></div>{staffFlags.other ? <input aria-label="기타 직원 역할" name="conti-other-staff-role" autoComplete="off" value={otherStaffRole} onChange={(event) => setOtherStaffRole(event.target.value)} placeholder="촬영할 역할을 입력해 주세요…" className={styles.control} /> : null}</Field>
            <Field step="05" label="하모니컷"><div className={styles.choiceRow}><Choice label="로비 하모니컷 촬영" checked={harmony} onChange={() => setHarmony((value) => !value)} /></div></Field>

            <Field step="06" label="촬영항목">
              {!department ? <span className={styles.hint}>진료과를 선택하면 촬영 가능한 항목이 표시됩니다.</span> : <div className={styles.categoryList}>{department.categories.map((category) => {
                const selected = Object.hasOwn(checked, category.id); const open = openGroups.has(category.id);
                return <div key={category.id} className={`${styles.category} ${selected ? styles.categorySelected : ""}`}>
                  <div className={styles.categoryHeader}>
                    <input id={`category-${category.id}`} className={styles.categoryToggle} type="checkbox" checked={selected} onChange={() => toggleCategory(category.id)} />
                    <label className={styles.categoryCheck} htmlFor={`category-${category.id}`}><Check aria-hidden="true" size={13} strokeWidth={2.2} /></label>
                    <button
                      type="button"
                      className={styles.categoryButton}
                      aria-expanded={category.details.length ? open : undefined}
                      aria-label={category.details.length ? `${category.label} 세부 항목 ${open ? "접기" : "펼치기"}` : `${category.label} 선택`}
                      onClick={() => {
                        if (!category.details.length) { toggleCategory(category.id); return; }
                        setOpenGroups((previous) => { const next = new Set(previous); if (open) next.delete(category.id); else next.add(category.id); return next; });
                      }}
                    >
                      <span>{category.label}</span>
                      <span className={styles.categoryMeta}>{category.details.length ? `세부 항목 ${category.details.length}개` : "선택 가능"}</span>
                      {category.details.length ? <ChevronDown aria-hidden="true" size={14} strokeWidth={1.6} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 420ms cubic-bezier(.32,.72,0,1)" }} /> : null}
                    </button>
                  </div>
                  {open && category.details.length > 0 ? <div className={styles.categoryDetails}>{category.details.map((detail) => <Choice detail key={detail} label={detail} checked={(checked[category.id] ?? []).includes(detail)} onChange={() => toggleDetail(category.id, detail)} />)}</div> : null}
                </div>;
              })}</div>}
            </Field>

            <Field step="07" label="기타 항목" optional>
              <div className={styles.extraRow}><input aria-label="기타 촬영 항목" name="conti-extra-item" autoComplete="off" value={extraDraft} onChange={(event) => setExtraDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addExtraItem(); } }} placeholder="예: 장비 단독컷, 건물 외관…" className={styles.control} /><button type="button" onClick={addExtraItem} className={styles.smallButton}><Plus aria-hidden="true" size={13} strokeWidth={1.8} />항목 추가</button></div>
              {extraItems.length ? <div className={styles.extraTags}>{extraItems.map((item) => <span key={item} className={styles.extraTag}>{item}<button type="button" onClick={() => setExtraItems((values) => values.filter((value) => value !== item))} aria-label={`${item} 삭제`}><Trash2 aria-hidden="true" size={10} strokeWidth={1.8} /></button></span>)}</div> : null}
            </Field>
          </div>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <footer className={styles.formFooter}>
            <span className={styles.selectionSummary}>대분류 {selectedCategories}개 · 세부 항목 {selectedDetails}개 선택</span>
            <button type="button" disabled={!canGenerate} onClick={handleGenerate} className={styles.primaryButton}>{submitting ? "콘티 생성 중…" : "콘티 자동 생성"}<span className={styles.primaryIcon}><Sparkles aria-hidden="true" size={15} strokeWidth={1.7} /></span></button>
          </footer>
        </main>
      </div>

      <div className={styles.previewShell}>
        <aside className={styles.previewPanel}>
          <div className={styles.previewHead}>
            <div className={styles.previewTitle}><div><span className={styles.eyebrow}>실시간 미리보기</span><h3>예상 촬영 순서</h3></div><span className={styles.liveBadge}>자동 구성</span></div>
            <div className={styles.previewStats}><div><strong>{draft?.scenes.length ?? 0}</strong><span>장면</span></div><div><strong>{totalMinutes}</strong><span>예상 시간(분)</span></div></div>
          </div>
          {draft?.scenes.length ? <div className={styles.sceneList}>{draft.scenes.map((scene, index) => <div key={scene.id} className={styles.sceneRow}><span className={styles.sceneNumber}>{String(index + 1).padStart(2, "0")}</span><div className={styles.sceneInfo}><strong>{scene.name}</strong><span>{scene.spaceText}{scene.procedures.length ? ` · ${scene.procedures.join(", ")}` : ""}</span></div><span className={styles.sceneTime}><Clock3 aria-hidden="true" size={11} strokeWidth={1.6} /> {scene.minutes}분</span></div>)}</div> : <div className={styles.emptyPreview}>촬영항목을 선택하면<br />장면 순서와 예상 시간이 여기에 나타납니다.</div>}
        </aside>
      </div>
    </div>
  );
}

function Field({ step, label, optional, children }: { step: string; label: string; optional?: boolean; children: React.ReactNode }) { return <section className={styles.fieldSection}><div className={styles.fieldHeading}><span className={styles.stepNumber}>{step}</span><div><span className={styles.fieldLabel}>{label}</span>{optional ? <span className={styles.optional}>선택 사항</span> : null}</div></div><div className={styles.fieldContent}>{children}</div></section>; }
function Choice({ label, checked, onChange, detail = false }: { label: string; checked: boolean; onChange: () => void; detail?: boolean }) { return <label className={detail ? styles.detailChoice : styles.choice}><input type="checkbox" checked={checked} onChange={onChange} /><span>{label}</span></label>; }
