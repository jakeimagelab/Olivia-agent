"use client";

import { ArrowLeft, ChevronDown, ChevronUp, FileDown, ListChecks, Mic, Plus, RefreshCw, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OliviaInterviewRecorder from "@/components/voice/OliviaInterviewRecorder";
import OliviaRecorder from "@/components/voice/OliviaRecorder";
import MobileInterviewPreparation, { type PreparationMobileStep } from "@/components/voice/MobileInterviewPreparation";
import MobileInterviewStandby from "@/components/voice/MobileInterviewStandby";
import TabletInterviewPreparation, { type TabletPreparationStep } from "@/components/voice/TabletInterviewPreparation";
import { DOCTOR_BRAND_INTERVIEW_QUESTIONS } from "@/lib/voice/interview/templates";
import { VOICE_INTERVIEW_RECOVERY_STORAGE_PREFIX, normalizeInterviewRecoveryState } from "@/lib/voice/interview/recovery";
import type { InterviewPreparation, InterviewQuestion, InterviewRecoveryState } from "@/lib/voice/interview/types";
import styles from "./VoiceInterviewHub.module.css";

type Mode = "general" | "interview";
type ClientOption = { id: string; hospitalName: string };
type FormState = { hospitalName: string; intervieweeName: string; interviewDate: string; clientId: string; selectedQuestionIds: string[] };
const initialForm: FormState = { hospitalName: "", intervieweeName: "", interviewDate: "", clientId: "", selectedQuestionIds: [] };

function asForm(preparation: InterviewPreparation): FormState {
  return {
    hospitalName: preparation.hospital_name || "", intervieweeName: preparation.interviewee_name || "", interviewDate: preparation.interview_date || "",
    clientId: preparation.client_id || "", selectedQuestionIds: preparation.selected_questions.map((question) => question.id),
  };
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: unknown };
  return typeof body.error === "string" ? body.error : fallback;
}

export default function VoiceInterviewHub({ embedded = false, mobileShell = false, tabletShell = false, onOpenResult }: {
  embedded?: boolean;
  mobileShell?: boolean;
  tabletShell?: boolean;
  onOpenResult?: (id: string) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<Mode>("general");
  const [preparations, setPreparations] = useState<InterviewPreparation[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<InterviewPreparation | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(["start_direction"]));
  const [saving, setSaving] = useState(false);
  const [recordingPreparation, setRecordingPreparation] = useState<InterviewPreparation | null>(null);
  const [recordingRecovery, setRecordingRecovery] = useState<InterviewRecoveryState | null>(null);
  const [recoveries, setRecoveries] = useState<InterviewRecoveryState[]>([]);
  const [mobileStep, setMobileStep] = useState<PreparationMobileStep>("info");
  const [mobileInfoExpanded, setMobileInfoExpanded] = useState(true);
  const [tabletStep, setTabletStep] = useState<TabletPreparationStep>("questions");
  const promptedRecoveriesRef = useRef(new Set<string>());
  const groupedQuestions = useMemo(() => {
    const groups = new Map<string, { title: string; questions: InterviewQuestion[] }>();
    for (const question of DOCTOR_BRAND_INTERVIEW_QUESTIONS) {
      const current = groups.get(question.sectionId) ?? { title: question.sectionTitle, questions: [] };
      current.questions.push(question); groups.set(question.sectionId, current);
    }
    return [...groups.entries()];
  }, []);
  const recoverablePreparations = useMemo(() => recoveries.flatMap((recovery) => {
    const preparation = preparations.find((candidate) => candidate.id === recovery.preparationId && candidate.current_version_id === recovery.versionId);
    return preparation ? [{ preparation, recovery }] : [];
  }), [preparations, recoveries]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [preparationsResponse, clientsResponse] = await Promise.all([
        fetch("/api/voice/interviews/preparations?limit=50", { cache: "no-store" }),
        fetch("/api/clients?scope=list", { cache: "no-store" }),
      ]);
      if (!preparationsResponse.ok) throw new Error(await readError(preparationsResponse, "인터뷰 준비 목록을 불러오지 못했습니다."));
      const preparationBody = await preparationsResponse.json() as { preparations?: InterviewPreparation[] };
      setPreparations(preparationBody.preparations ?? []);
      if (clientsResponse.ok) {
        const clientBody = await clientsResponse.json() as { clients?: Array<{ id?: unknown; hospitalName?: unknown; hospital_name?: unknown; name?: unknown }> };
        setClients((clientBody.clients ?? []).flatMap((client) => {
          const id = typeof client.id === "string" ? client.id : "";
          const hospitalName = typeof client.hospitalName === "string" ? client.hospitalName : typeof client.hospital_name === "string" ? client.hospital_name : typeof client.name === "string" ? client.name : "";
          return id && hospitalName ? [{ id, hospitalName }] : [];
        }));
      }
      setError("");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "인터뷰 준비 목록을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (mode === "interview") void load(); }, [load, mode]);
  useEffect(() => {
    if (mode !== "interview") return;
    try {
      const restored = Object.keys(localStorage)
        .filter((key) => key.startsWith(VOICE_INTERVIEW_RECOVERY_STORAGE_PREFIX))
        .flatMap((key) => {
          const value = normalizeInterviewRecoveryState(JSON.parse(localStorage.getItem(key) || "null"));
          return value ? [value] : [];
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      setRecoveries(restored);
    } catch (storageError) {
      console.warn("[voice/interview/recovery-list]", storageError);
      setRecoveries([]);
    }
  }, [mode, preparations]);
  useEffect(() => {
    if (mode !== "interview" || recordingPreparation || !recoverablePreparations.length) return;
    const candidate = recoverablePreparations.find(({ recovery }) => !promptedRecoveriesRef.current.has(recovery.recordingId));
    if (!candidate) return;
    promptedRecoveriesRef.current.add(candidate.recovery.recordingId);
    if (window.confirm(`${candidate.preparation.hospital_name} 인터뷰가 완료되지 않았습니다.\n이미 저장된 녹음은 다시 올리지 않고 이어서 복구할까요?`)) {
      setRecordingRecovery(candidate.recovery);
      setRecordingPreparation(candidate.preparation);
    }
  }, [mode, recordingPreparation, recoverablePreparations]);
  useEffect(() => {
    if (!tabletShell) return;
    const frame = rootRef.current?.closest<HTMLElement>("[data-tablet-app-frame][data-tablet-scroll-owner='page']");
    requestAnimationFrame(() => frame?.scrollTo({ top: 0, behavior: "auto" }));
  }, [creating, editing?.id, editing?.status, mode, recordingPreparation?.id, tabletShell, tabletStep]);

  const beginNew = useCallback(() => { setEditing(null); setCreating(true); setForm(initialForm); setOpenSections(new Set(["start_direction"])); setMobileStep("info"); setMobileInfoExpanded(true); setTabletStep("questions"); setError(""); }, []);
  const openEditor = useCallback((preparation: InterviewPreparation) => { setCreating(false); setEditing(preparation); setForm(asForm(preparation)); setMobileStep("info"); setMobileInfoExpanded(true); setTabletStep("questions"); setError(""); }, []);
  const toggleQuestion = useCallback((id: string) => {
    setForm((current) => ({
      ...current,
      selectedQuestionIds: current.selectedQuestionIds.includes(id)
        ? current.selectedQuestionIds.filter((questionId) => questionId !== id)
        : [...current.selectedQuestionIds, id],
    }));
    setMobileInfoExpanded(false);
  }, []);
  const reorder = useCallback((from: number, direction: -1 | 1) => setForm((current) => {
    const to = from + direction; if (to < 0 || to >= current.selectedQuestionIds.length) return current;
    const selectedQuestionIds = [...current.selectedQuestionIds];
    [selectedQuestionIds[from], selectedQuestionIds[to]] = [selectedQuestionIds[to], selectedQuestionIds[from]];
    return { ...current, selectedQuestionIds };
  }), []);
  const requestBody = useCallback(() => ({
    hospitalName: form.hospitalName, intervieweeName: form.intervieweeName, interviewDate: form.interviewDate || null,
    clientId: form.clientId || null, selectedQuestions: form.selectedQuestionIds,
  }), [form]);
  const save = useCallback(async (): Promise<InterviewPreparation | null> => {
    setSaving(true); setError("");
    try {
      const response = await fetch(editing ? `/api/voice/interviews/preparations/${editing.id}` : "/api/voice/interviews/preparations", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody()),
      });
      if (!response.ok) throw new Error(await readError(response, "인터뷰 준비를 저장하지 못했습니다."));
      const data = await response.json() as { preparation: InterviewPreparation };
      setEditing(data.preparation); setCreating(false); setForm(asForm(data.preparation)); await load();
      return data.preparation;
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "인터뷰 준비를 저장하지 못했습니다."); return null; }
    finally { setSaving(false); }
  }, [editing, load, requestBody]);
  const ready = useCallback(async () => {
    const saved = await save(); if (!saved) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/voice/interviews/preparations/${saved.id}/ready`, { method: "POST" });
      if (!response.ok) throw new Error(await readError(response, "질문지 PDF를 생성하지 못했습니다."));
      const data = await response.json() as { preparation: InterviewPreparation };
      setEditing(data.preparation); setForm(asForm(data.preparation)); await load();
    } catch (readyError) { setError(readyError instanceof Error ? readyError.message : "질문지 PDF를 생성하지 못했습니다."); }
    finally { setSaving(false); }
  }, [load, save]);
  const selectedQuestions = form.selectedQuestionIds.map((id) => DOCTOR_BRAND_INTERVIEW_QUESTIONS.find((question) => question.id === id)).filter((question): question is InterviewQuestion => Boolean(question));
  const updateMobileForm = useCallback((patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch })), []);
  const toggleSection = useCallback((sectionId: string) => setOpenSections((current) => {
    const next = new Set(current); if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId); return next;
  }), []);
  const setMobilePreparationStep = useCallback((next: PreparationMobileStep) => {
    if (next === "questions" && (!form.hospitalName.trim() || !form.intervieweeName.trim())) {
      setError("병원명과 인터뷰 대상을 입력해주세요.");
      return;
    }
    if (next === "order" && selectedQuestions.length === 0) {
      setError("확인할 질문을 하나 이상 선택해주세요.");
      return;
    }
    setError("");
    if (next === "questions") setMobileInfoExpanded(false);
    setMobileStep(next);
  }, [form.hospitalName, form.intervieweeName, selectedQuestions.length]);
  const setTabletPreparationStep = useCallback((next: TabletPreparationStep) => {
    if (next === "order" && (!form.hospitalName.trim() || !form.intervieweeName.trim())) {
      setError("병원명과 인터뷰 대상을 입력해주세요.");
      return;
    }
    if (next === "order" && selectedQuestions.length === 0) {
      setError("확인할 질문을 하나 이상 선택해주세요.");
      return;
    }
    setError("");
    setTabletStep(next);
  }, [form.hospitalName, form.intervieweeName, selectedQuestions.length]);

  if (mode === "general") return <section ref={rootRef} className={`${styles.general} ${tabletShell ? styles.tabletVoiceGeneral : ""}`}><div className={styles.modeBar}><button type="button" className={styles.active} onClick={() => setMode("general")}><Volume2 size={16} />일반 녹음</button><button type="button" onClick={() => setMode("interview")}><Mic size={16} />인터뷰 모드</button></div><OliviaRecorder embedded={embedded} mobileShell={mobileShell} tabletShell={tabletShell} onOpenResult={onOpenResult} /></section>;
  if (recordingPreparation) return <section ref={rootRef} className={`${styles.interviewFrame} ${mobileShell ? styles.mobileInterviewFrame : ""} ${tabletShell ? styles.tabletInterviewFrame : ""}`}><OliviaInterviewRecorder preparation={recordingPreparation} recovery={recordingRecovery} tabletShell={tabletShell} onClose={() => { setRecordingPreparation(null); setRecordingRecovery(null); void load(); }} onComplete={(id) => { setRecordingPreparation(null); setRecordingRecovery(null); onOpenResult?.(id); }} /></section>;
  if ((editing || creating) && mobileShell) return <section className={`${styles.interviewFrame} ${styles.mobileInterviewFrame}`}><MobileInterviewPreparation preparation={editing} form={form} clients={clients} groups={groupedQuestions} selectedQuestions={selectedQuestions} step={mobileStep} infoExpanded={mobileInfoExpanded} openSections={openSections} saving={saving} error={error} onBack={() => { if (mobileStep === "order") { setMobileStep("questions"); return; } if (mobileStep === "questions") { setMobileStep("info"); setMobileInfoExpanded(true); return; } setEditing(null); setCreating(false); setForm(initialForm); setMobileStep("info"); }} onChangeForm={updateMobileForm} onToggleQuestion={toggleQuestion} onToggleSection={toggleSection} onReorder={reorder} onStep={setMobilePreparationStep} onInfoExpanded={setMobileInfoExpanded} onSave={() => void save()} onReady={() => void ready()} onStart={() => editing && setRecordingPreparation(editing)} /></section>;
  if (mobileShell) return <section className={`${styles.interviewFrame} ${styles.mobileInterviewFrame}`}><MobileInterviewStandby preparations={preparations} loading={loading} error={error} onBack={() => setMode("general")} onRefresh={() => void load()} onCreate={beginNew} onOpen={openEditor} onStart={(preparation) => setRecordingPreparation(preparation)} /></section>;
  if ((editing || creating) && tabletShell) return <section ref={rootRef} className={`${styles.interviewFrame} ${styles.tabletInterviewFrame}`}><TabletInterviewPreparation preparation={editing} form={form} clients={clients} groups={groupedQuestions} selectedQuestions={selectedQuestions} step={tabletStep} openSections={openSections} saving={saving} error={error} onBack={() => { if (tabletStep === "order") { setTabletStep("questions"); return; } setEditing(null); setCreating(false); setForm(initialForm); setTabletStep("questions"); }} onChangeForm={updateMobileForm} onToggleQuestion={toggleQuestion} onToggleSection={toggleSection} onReorder={reorder} onStep={setTabletPreparationStep} onSave={() => void save()} onReady={() => void ready()} onStart={() => editing && setRecordingPreparation(editing)} /></section>;
  if (editing || creating) return <section ref={rootRef} className={`${styles.interviewFrame} ${tabletShell ? styles.tabletInterviewFrame : ""}`}><header className={styles.toolbar}><button type="button" onClick={() => { setEditing(null); setCreating(false); setForm(initialForm); }}><ArrowLeft size={17} />준비 목록</button><div><p>INTERVIEW PREPARATION</p><h1>{editing ? "인터뷰 준비 수정" : "새 인터뷰 준비"}</h1></div><span>{selectedQuestions.length}개 선택</span></header>{editing?.status === "ready" ? <div className={styles.changedNotice}>준비 완료 후 내용을 수정하면 초안으로 돌아갑니다. 다시 준비 완료하면 새 질문지가 생성됩니다.</div> : null}{editing?.ready_error ? <div className={styles.error}>{editing.ready_error}<br />내용을 확인한 뒤 <strong>준비 완료</strong>를 다시 눌러주세요.</div> : null}<div className={styles.editorGrid}><section className={styles.infoCard}><h2>인터뷰 정보</h2><label>등록 고객 (선택)<select value={form.clientId} onChange={(event) => { const client = clients.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, clientId: event.target.value, hospitalName: client?.hospitalName || current.hospitalName })); }}><option value="">고객 연결 안 함</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.hospitalName}</option>)}</select></label><label>병원명<input value={form.hospitalName} onChange={(event) => setForm((current) => ({ ...current, hospitalName: event.target.value }))} placeholder="여의도기통찬의원" /></label><label>인터뷰 대상<input value={form.intervieweeName} onChange={(event) => setForm((current) => ({ ...current, intervieweeName: event.target.value }))} placeholder="김지훈 원장" /></label><label>인터뷰 예정일<input type="date" value={form.interviewDate} onChange={(event) => setForm((current) => ({ ...current, interviewDate: event.target.value }))} /></label><p>고객과 프로젝트는 명시적으로 선택한 경우에만 연결됩니다.</p></section><section className={styles.questionPicker}><header><div><p>35개 질문 중 선택</p><h2>5~7개 질문을 추천합니다</h2></div><span>{selectedQuestions.length}개</span></header>{groupedQuestions.map(([sectionId, group]) => <div className={styles.sectionAccordion} key={sectionId}><button type="button" onClick={() => setOpenSections((current) => { const next = new Set(current); if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId); return next; })}><span>{group.title}</span><small>{group.questions.filter((question) => form.selectedQuestionIds.includes(question.id)).length}개</small>{openSections.has(sectionId) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{openSections.has(sectionId) ? <div>{group.questions.map((question) => <label key={question.id}><input type="checkbox" checked={form.selectedQuestionIds.includes(question.id)} onChange={() => toggleQuestion(question.id)} /><span><i>{question.number}</i>{question.text}</span></label>)}</div> : null}</div>)}</section><section className={styles.orderCard}><header><p>선택한 질문 확인</p><h2>현장에서도 이 순서 그대로 진행합니다</h2></header>{selectedQuestions.length ? <ol>{selectedQuestions.map((question, index) => <li key={question.id}><span>{index + 1}</span><p><small>{question.sectionTitle}</small>{question.text}</p><div><button type="button" disabled={index === 0} onClick={() => reorder(index, -1)}>↑</button><button type="button" disabled={index === selectedQuestions.length - 1} onClick={() => reorder(index, 1)}>↓</button></div></li>)}</ol> : <p className={styles.empty}>질문을 선택하면 여기에서 순서를 바꿀 수 있어요.</p>}<div className={styles.editorActions}><button type="button" disabled={saving} onClick={() => void save()}>{saving ? "저장 중…" : "초안 저장"}</button><button type="button" className={styles.primary} disabled={saving} onClick={() => void ready()}>{saving ? "질문지 생성 중…" : "준비 완료"}</button></div></section></div>{error ? <div className={styles.error}>{error}</div> : null}{editing?.status === "ready" && editing.current_version_id ? <section className={styles.readyCard}><CheckMark /><div><p>인터뷰 준비 완료</p><h2>질문 {editing.selected_questions.length}개 · PDF 생성 완료</h2><span>병원에 전달한 질문 그대로 현장에서 녹음합니다.</span></div><div><a href={`/api/voice/interviews/preparations/${editing.id}/pdf?preview=html`} target="_blank" rel="noreferrer">PDF 미리보기</a><a href={`/api/voice/interviews/preparations/${editing.id}/pdf`} target="_blank" rel="noreferrer"><FileDown size={15} />PDF 다운로드</a><button type="button" className={styles.primary} onClick={() => setRecordingPreparation(editing)}><Mic size={15} />인터뷰 시작</button></div></section> : null}</section>;
  return <section ref={rootRef} className={`${styles.interviewFrame} ${tabletShell ? styles.tabletInterviewFrame : ""}`}><header className={styles.toolbar}><button type="button" onClick={() => setMode("general")}><ArrowLeft size={17} />일반 녹음</button><div><p>OLIVIA VOICE</p><h1>인터뷰 모드</h1></div><button type="button" onClick={() => void load()} disabled={loading} aria-label="새로고침"><RefreshCw size={16} /></button></header><div className={styles.standbyHero}><div><p>INTERVIEW STANDBY</p><h2>병원 브랜드 인터뷰를<br />미리 준비하세요</h2><span>질문을 고르고 순서를 확정하면, 병원 전달 PDF와 현장 녹음이 같은 Snapshot을 사용합니다.</span></div><button type="button" className={styles.primary} onClick={beginNew}><Plus size={17} />새 인터뷰 준비</button></div>{error ? <div className={styles.error}>{error}</div> : null}<section className={styles.standbyList}><header><div><p>준비된 인터뷰</p><h2>INTERVIEW STANDBY</h2></div><span>{preparations.filter((preparation) => preparation.status === "ready").length}개</span></header>{preparations.filter((preparation) => preparation.status === "ready").length ? <div className={styles.cards}>{preparations.filter((preparation) => preparation.status === "ready").map((preparation) => <article key={preparation.id}><span className={styles.readyPill}>● 준비 완료</span><h3>{preparation.hospital_name}</h3><p>{preparation.interviewee_name}</p><small>{preparation.interview_date || "날짜 미정"} · 질문 {preparation.selected_questions.length}개</small><div><button type="button" onClick={() => openEditor(preparation)}><ListChecks size={15} />질문 확인</button><button type="button" className={styles.primary} onClick={() => setRecordingPreparation(preparation)}><Mic size={15} />인터뷰 시작</button></div></article>)}</div> : <p className={styles.empty}>준비 완료된 인터뷰가 없습니다. 새 인터뷰를 준비해보세요.</p>}</section><section className={styles.recent}><header><p>최근 인터뷰</p><h2>초안 및 완료 기록</h2></header>{preparations.filter((preparation) => preparation.status !== "ready").map((preparation) => <button type="button" key={preparation.id} onClick={() => openEditor(preparation)}><span>{preparation.status === "completed" ? "완료" : preparation.status === "draft" ? "초안" : preparation.status}</span><strong>{preparation.hospital_name || "병원명 미입력"}</strong><small>{preparation.interviewee_name || "인터뷰 대상 미입력"}</small></button>)}</section></section>;
}

function CheckMark() { return <span className={styles.checkMark}>✓</span>; }
