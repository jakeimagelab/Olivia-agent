"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Clock3, FileUp, History, Plus, Sparkles, Trash2 } from "lucide-react";
import { generateContiDraft, type ContiDoctorInput, type GenerateContiInput, type HospitalSpaceRow, type HospitalStaffRow } from "@/lib/conti/generate";
import { buildCodeSceneTemplates, CONTI_DEPARTMENT_LIST, getSelectableContiCategories, getSurgeryTypesForDepartment, type ContiSurgeryType } from "@/lib/conti/departmentTaxonomy";
import ContiPreviousDrawer from "@/components/conti/v2/ContiPreviousDrawer";
import styles from "@/components/conti/v2/ContiV2.module.css";

interface ClientOption { id: string; name: string }

export interface ContiCreateScreenProps {
  surface?: "default" | "tablet" | "workspace";
  onGenerated: (runId: string, metadata?: { warnings?: string[]; spaceMatchStats?: { matched: number; total: number } }) => void;
  initialClientId?: string;
  workflowRunId?: string;
  resourceId?: string;
  onOpenExisting?: (runId: string) => void;
}

const emptyStaff = { siljang: false, jikwon: false, other: false };
const newDoctor = (id = crypto.randomUUID()): ContiDoctorInput => ({ id, name: "", surgeries: [], note: "", day: null });

export default function ContiCreateScreen({ surface = "default", onGenerated, initialClientId, workflowRunId, resourceId, onOpenExisting }: ContiCreateScreenProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [hospitalId, setHospitalId] = useState(initialClientId ?? "");
  const [specialty, setSpecialty] = useState("");
  const [doctors, setDoctors] = useState<ContiDoctorInput[]>(() => [newDoctor("d1")]);
  const [customSurgeryTypes, setCustomSurgeryTypes] = useState<ContiSurgeryType[]>([]);
  const [surgeryDraft, setSurgeryDraft] = useState("");
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const [personalOptions, setPersonalOptions] = useState({ makeup: false, profile: false });
  const [extraItems, setExtraItems] = useState<string[]>([]);
  const [extraDraft, setExtraDraft] = useState("");
  const [hospitalSpaces, setHospitalSpaces] = useState<HospitalSpaceRow[]>([]);
  const [hospitalStaff, setHospitalStaff] = useState<HospitalStaffRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sourceNotice, setSourceNotice] = useState("");
  const [previousOpen, setPreviousOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/clients").then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error ?? "병원 목록을 불러오지 못했습니다.");
      setClients((data.clients ?? []).map((client: { id: string; hospital_name?: string }) => ({ id: client.id, name: client.hospital_name || "(이름 없음)" })));
    }).catch((caught) => setSourceNotice(caught instanceof Error ? caught.message : "병원 목록을 불러오지 못했습니다."));
  }, []);

  useEffect(() => { if (initialClientId) setHospitalId(initialClientId); }, [initialClientId]);

  useEffect(() => {
    if (!hospitalId) { setHospitalSpaces([]); setHospitalStaff([]); return; }
    fetch(`/api/conti/hospital-profile?hospitalId=${encodeURIComponent(hospitalId)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error ?? "병원 공간과 직원 정보를 불러오지 못했습니다.");
        setHospitalSpaces(data.spaces ?? []); setHospitalStaff(data.staff ?? []); setSourceNotice("");
      })
      .catch((caught) => setSourceNotice(caught instanceof Error ? caught.message : "병원 공간과 직원 정보를 불러오지 못했습니다."));
  }, [hospitalId]);

  const selectableCategories = useMemo(() => getSelectableContiCategories(specialty), [specialty]);
  const surgeryTypes = useMemo(() => [...getSurgeryTypesForDepartment(specialty), ...customSurgeryTypes], [customSurgeryTypes, specialty]);
  const templates = useMemo(() => buildCodeSceneTemplates(specialty), [specialty]);
  const enteredDoctors = useMemo(() => doctors.filter((doctor) => doctor.name.trim()), [doctors]);
  const input: GenerateContiInput = useMemo(() => ({ specialty, doctorCount: enteredDoctors.length || 1, doctors: enteredDoctors, staffFlags: emptyStaff, otherStaffRole: "", harmony: false, personalOptions, checked, extraItems }), [specialty, enteredDoctors, personalOptions, checked, extraItems]);
  const draft = useMemo(() => specialty ? generateContiDraft(input, { templates, hospitalSpaces, hospitalStaff }) : null, [specialty, input, templates, hospitalSpaces, hospitalStaff]);
  const totalMinutes = draft?.scenes.reduce((sum, scene) => sum + (scene.minutes ?? 0), 0) ?? 0;

  function selectDepartment(value: string) { setSpecialty(value); setChecked({}); setCustomSurgeryTypes([]); setDoctors((rows) => rows.map((doctor) => ({ ...doctor, surgeries: [] }))); }

  function updateDoctor(id: string, patch: Partial<ContiDoctorInput>) {
    setDoctors((rows) => rows.map((doctor) => doctor.id === id ? { ...doctor, ...patch } : doctor));
  }

  function toggleDoctorSurgery(id: string, surgeryId: string) {
    setDoctors((rows) => rows.map((doctor) => doctor.id !== id ? doctor : {
      ...doctor,
      surgeries: doctor.surgeries.includes(surgeryId) ? doctor.surgeries.filter((value) => value !== surgeryId) : [...doctor.surgeries, surgeryId],
    }));
  }

  function addSurgeryType() {
    const label = surgeryDraft.trim();
    if (!label || surgeryTypes.some((item) => item.label === label)) return;
    setCustomSurgeryTypes((items) => [...items, { id: `custom:${label}`, label }]);
    setSurgeryDraft("");
  }

  function toggleCategory(categoryId: string) {
    setChecked((previous) => {
      const next = { ...previous };
      if (Object.hasOwn(next, categoryId)) delete next[categoryId];
      else next[categoryId] = [];
      return next;
    });
  }

  function toggleCategoryDetail(categoryId: string, detail: string) {
    setChecked((previous) => {
      const current = previous[categoryId] ?? [];
      return {
        ...previous,
        [categoryId]: current.includes(detail) ? current.filter((item) => item !== detail) : [...current, detail],
      };
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
      onGenerated(data.run.id, { warnings: data.warnings ?? [], spaceMatchStats: data.spaceMatchStats });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "생성 실패"); }
    finally { setSubmitting(false); }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    if (file.size > 4.4 * 1024 * 1024) { setError("파일은 4.4MB 이하로 준비해 주세요."); return; }
    setImporting(true); setError("");
    try {
      const formData = new FormData(); formData.append("file", file);
      const parsedResponse = await fetch("/api/conti/parse-pdf", { method: "POST", body: formData });
      const parsed = await parsedResponse.json().catch(() => ({}));
      if (!parsedResponse.ok || !parsed.ok) throw new Error(parsed.error ?? "파일을 인식하지 못했습니다.");
      const importResponse = await fetch("/api/conti/runs/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hospitalId: hospitalId || null, hospitalName: clients.find((client) => client.id === hospitalId)?.name, workflowRunId, title: file.name.replace(/\.(pdf|jpe?g|png|gif|webp)$/i, ""), conti: parsed.conti ?? [], checklist: parsed.checklist ?? [], schedule: parsed.schedule ?? [] }) });
      const imported = await importResponse.json().catch(() => ({}));
      if (!importResponse.ok || !imported.ok || !imported.run?.id) throw new Error(imported.error ?? "가져온 콘티를 저장하지 못했습니다.");
      onGenerated(imported.run.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "콘티 가져오기에 실패했습니다."); }
    finally { setImporting(false); if (importInputRef.current) importInputRef.current.value = ""; }
  }

  const selectedCategories = Object.keys(checked).length;
  const selectedDetails = Object.values(checked).reduce((sum, items) => sum + items.length, 0);
  const canGenerate = Boolean(specialty) && enteredDoctors.length > 0 && !submitting;

  return (
    <div className={styles.createLayout} data-conti-surface={surface}>
      <div className={styles.formShell}>
        <main className={styles.formPanel}>
          {surface === "workspace" ? <div className={styles.workspaceCreateTools} aria-label="콘티 불러오기 도구">
            <button type="button" onClick={() => setPreviousOpen(true)} className={styles.previousButton}><History aria-hidden="true" size={14} />이전 콘티 보기</button>
            <button type="button" disabled={importing} onClick={() => importInputRef.current?.click()} className={styles.previousButton}><FileUp aria-hidden="true" size={14} />{importing ? "파일 인식 중…" : "PDF / 이미지 불러오기"}</button>
            <input ref={importInputRef} hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => void handleImport(event.target.files?.[0])} />
          </div> : <header className={styles.formHero}>
            <div>
              <span className={styles.eyebrow}>AI 콘티 자동 생성</span>
              <h2>필요한 촬영 장면만<br />선택해 주세요.</h2>
              <p>진료과와 참여 인원, 촬영 항목을 고르면 현장에서 바로 사용할 수 있는 순서로 자동 구성합니다.</p>
            </div>
            {surface !== "tablet" ? <div className={styles.heroActions}>
              <button type="button" onClick={() => setPreviousOpen(true)} className={styles.previousButton}><History aria-hidden="true" size={14} />이전 콘티 보기</button>
              <button type="button" disabled={importing} onClick={() => importInputRef.current?.click()} className={styles.previousButton}><FileUp aria-hidden="true" size={14} />{importing ? "파일 인식 중…" : "PDF / 이미지 불러오기"}</button>
              <input ref={importInputRef} hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => void handleImport(event.target.files?.[0])} />
              <div className={styles.heroMark}><Camera aria-hidden="true" size={27} strokeWidth={1.5} /></div>
            </div> : null}
          </header>}

          {surface === "tablet" ? <div className={styles.tabletUtilityBar} aria-label="콘티 도구">
            <button type="button" onClick={() => setPreviousOpen(true)}><History aria-hidden="true" size={15} />이전 콘티 보기</button>
            <button type="button" disabled={importing} onClick={() => importInputRef.current?.click()}><FileUp aria-hidden="true" size={15} />{importing ? "파일 인식 중…" : "PDF / 이미지 불러오기"}</button>
            <button type="button" className={styles.tabletCameraButton} aria-label="카메라로 콘티 불러오기" onClick={() => importInputRef.current?.click()}><Camera aria-hidden="true" size={17} /></button>
            <input ref={importInputRef} hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => void handleImport(event.target.files?.[0])} />
          </div> : null}

          <div className={styles.formBody}>
            <Field step="1" label="병원" optional><select aria-label="병원 선택" name="conti-hospital" value={hospitalId} onChange={(event) => setHospitalId(event.target.value)} className={styles.control}><option value="">병원 연결 없이 만들기</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
            <Field step="2" label="진료과"><select aria-label="진료과 선택" name="conti-specialty" value={specialty} onChange={(event) => selectDepartment(event.target.value)} className={styles.control}><option value="">진료과를 선택해 주세요</option>{CONTI_DEPARTMENT_LIST.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            <Field step="3" label="의료진">
              <div className={styles.doctorTable}>
                <div className={styles.doctorTableHead}><span>#</span><span>이름</span><span>담당 수술</span><span>메모</span><span aria-hidden="true" /></div>
                {doctors.map((doctor, index) => <div key={doctor.id} className={styles.doctorTableRow}>
                  <span className={styles.doctorIndex}>{index + 1}</span>
                  <input aria-label={`의료진 ${index + 1} 이름`} value={doctor.name} onChange={(event) => updateDoctor(doctor.id, { name: event.target.value })} placeholder="이름" />
                  <div className={styles.surgeryChecks}>{surgeryTypes.map((item) => <label key={item.id}><input type="checkbox" checked={doctor.surgeries.includes(item.id)} onChange={() => toggleDoctorSurgery(doctor.id, item.id)} /><span>{item.label}</span></label>)}</div>
                  <input aria-label={`의료진 ${index + 1} 메모`} value={doctor.note} onChange={(event) => updateDoctor(doctor.id, { note: event.target.value })} placeholder="메모" />
                  <button type="button" disabled={doctors.length === 1} onClick={() => setDoctors((rows) => rows.filter((row) => row.id !== doctor.id))} aria-label={`${doctor.name || `의료진 ${index + 1}`} 삭제`}><Trash2 size={14} /></button>
                </div>)}
                <div className={styles.doctorTableActions}>
                  <button type="button" onClick={() => setDoctors((rows) => rows.length < 10 ? [...rows, newDoctor()] : rows)} disabled={doctors.length >= 10}><Plus size={13} />의료진 추가</button>
                  <div><input aria-label="수술 종류 추가" value={surgeryDraft} onChange={(event) => setSurgeryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSurgeryType(); } }} placeholder="수술 종류" /><button type="button" onClick={addSurgeryType}><Plus size={13} />수술 종류 추가</button></div>
                </div>
              </div>
            </Field>

            <Field step="4" label="의료진 개인 촬영" optional>
              <div className={styles.choiceRow}>
                <label className={styles.choice}>
                  <input type="checkbox" checked={personalOptions.makeup} onChange={(event) => setPersonalOptions((value) => ({ ...value, makeup: event.target.checked }))} />
                  <span>헤어메이크업 · 준비</span>
                </label>
                <label className={styles.choice}>
                  <input type="checkbox" checked={personalOptions.profile} onChange={(event) => setPersonalOptions((value) => ({ ...value, profile: event.target.checked }))} />
                  <span>의료진 프로필</span>
                </label>
              </div>
              <span className={styles.hint}>필요한 촬영만 선택하세요. 진료 연출과 수술 연출은 기본으로 들어갑니다.</span>
            </Field>

            <Field step="5" label="촬영항목">
              {!specialty ? <span className={styles.hint}>진료과를 선택하면 촬영 가능한 항목이 표시됩니다.</span> : <div className={styles.categoryList}>{selectableCategories.map((category) => {
                const selected = Object.hasOwn(checked, category.id);
                return <div key={category.id} className={`${styles.category} ${selected ? styles.categorySelected : ""}`}>
                  <div className={styles.categoryHeader}>
                    <input id={`category-${category.id}`} className={styles.categoryToggle} type="checkbox" checked={selected} onChange={() => toggleCategory(category.id)} />
                    <label className={styles.categoryCheck} htmlFor={`category-${category.id}`}><Check aria-hidden="true" size={13} strokeWidth={2.2} /></label>
                    <button type="button" className={styles.categoryButton} aria-label={`${category.label} 선택`} onClick={() => toggleCategory(category.id)}>
                      <span>{category.label}</span>
                      <span className={styles.categoryMeta}>선택 가능</span>
                    </button>
                  </div>
                  {selected && category.details.length ? <div className={styles.categoryDetails} aria-label={`${category.label} 세부 촬영 항목`}>
                    {category.details.map((detail) => <label key={detail} className={styles.detailChoice}>
                      <input type="checkbox" checked={(checked[category.id] ?? []).includes(detail)} onChange={() => toggleCategoryDetail(category.id, detail)} />
                      <span>{detail}</span>
                    </label>)}
                  </div> : null}
                </div>;
              })}</div>}
            </Field>

            <Field step="6" label="기타 항목" optional>
              <div className={styles.extraRow}><input aria-label="기타 촬영 항목" name="conti-extra-item" autoComplete="off" value={extraDraft} onChange={(event) => setExtraDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addExtraItem(); } }} placeholder="예: 장비 단독컷, 건물 외관…" className={styles.control} /><button type="button" onClick={addExtraItem} className={styles.smallButton}><Plus aria-hidden="true" size={13} strokeWidth={1.8} />항목 추가</button></div>
              {extraItems.length ? <div className={styles.extraTags}>{extraItems.map((item) => <span key={item} className={styles.extraTag}>{item}<button type="button" onClick={() => setExtraItems((values) => values.filter((value) => value !== item))} aria-label={`${item} 삭제`}><Trash2 aria-hidden="true" size={10} strokeWidth={1.8} /></button></span>)}</div> : null}
            </Field>
          </div>

          {sourceNotice ? <p className={styles.sourceNotice} role="status">{sourceNotice} 병원 연결 없이 만들 수 있습니다.</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <footer className={styles.formFooter}>
            <span className={styles.selectionSummary}>의료진 {enteredDoctors.length}명 · 고정 장면 3개 · 선택 항목 {selectedCategories + Number(personalOptions.makeup) + Number(personalOptions.profile)}개 · 세부 {selectedDetails}개</span>
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
          {draft?.scenes.length ? <div className={styles.sceneList}>{draft.scenes.map((scene, index) => <div key={scene.id} className={styles.sceneRow}><span className={styles.sceneNumber}>{index + 1}</span><div className={styles.sceneInfo}><strong>{scene.name}</strong><span>{scene.spaceText}{scene.procedures.length ? ` · ${scene.procedures.join(", ")}` : ""}</span></div><span className={styles.sceneTime}><Clock3 aria-hidden="true" size={11} strokeWidth={1.6} /> {scene.minutes}분</span></div>)}</div> : <div className={styles.emptyPreview}>촬영항목을 선택하면<br />장면 순서와 예상 시간이 여기에 나타납니다.</div>}
        </aside>
      </div>
      <ContiPreviousDrawer open={previousOpen} onClose={() => setPreviousOpen(false)} onOpen={(runId) => { setPreviousOpen(false); (onOpenExisting ?? onGenerated)(runId); }} />
    </div>
  );
}

function Field({ step, label, optional, children }: { step: string; label: string; optional?: boolean; children: React.ReactNode }) { return <section className={styles.fieldSection}><div className={styles.fieldHeading}><span className={styles.stepNumber}>{step}</span><div><span className={styles.fieldLabel}>{label}</span>{optional ? <span className={styles.optional}>선택 사항</span> : null}</div></div><div className={styles.fieldContent}>{children}</div></section>; }
