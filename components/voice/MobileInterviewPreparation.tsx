"use client";

import { ArrowLeft, Check, ChevronDown, ChevronUp, FileDown, Mic } from "lucide-react";
import type { InterviewPreparation, InterviewQuestion } from "@/lib/voice/interview/types";
import styles from "./MobileInterviewPreparation.module.css";

export type PreparationMobileStep = "info" | "questions" | "order";

type FormValue = {
  hospitalName: string;
  intervieweeName: string;
  interviewDate: string;
  clientId: string;
  selectedQuestionIds: string[];
};

type ClientOption = { id: string; hospitalName: string };

function formatDate(value: string) {
  if (!value) return "날짜 미정";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${Number(month)}/${Number(day)}` : value;
}

function StepToolbar({ step, title, count, onBack }: { step: PreparationMobileStep; title: string; count: number; onBack: () => void }) {
  const number = step === "info" ? 1 : step === "questions" ? 2 : 3;
  return <header className={styles.toolbar}><button type="button" onClick={onBack}><ArrowLeft size={16} />{number === 1 ? "준비 목록" : "이전"}</button><div><small>{number} / 3</small><h1>{title}</h1></div><span>{step === "questions" ? `${count}개 선택` : ""}</span></header>;
}

function InterviewFields({ form, clients, onChange }: { form: FormValue; clients: ClientOption[]; onChange: (patch: Partial<FormValue>) => void }) {
  return <section className={styles.infoCard}><h2>인터뷰 정보</h2><label>등록 고객 (선택)<select value={form.clientId} onChange={(event) => { const client = clients.find((item) => item.id === event.target.value); onChange({ clientId: event.target.value, hospitalName: client?.hospitalName || form.hospitalName }); }}><option value="">고객 연결 안 함</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.hospitalName}</option>)}</select></label><label>병원명<input value={form.hospitalName} onChange={(event) => onChange({ hospitalName: event.target.value })} placeholder="여의도기통찬의원" /></label><label>인터뷰 대상<input value={form.intervieweeName} onChange={(event) => onChange({ intervieweeName: event.target.value })} placeholder="김지훈 원장" /></label><label>인터뷰 예정일<input type="date" value={form.interviewDate} onChange={(event) => onChange({ interviewDate: event.target.value })} /></label></section>;
}

function QuestionPicker({ groups, form, openSections, onToggleSection, onToggleQuestion }: {
  groups: Array<[string, { title: string; questions: InterviewQuestion[] }]>;
  form: FormValue;
  openSections: Set<string>;
  onToggleSection: (sectionId: string) => void;
  onToggleQuestion: (id: string) => void;
}) {
  return <section className={styles.questionPicker}><header><div><p>35개 질문 중 선택</p><h2>5~7개 질문을 추천합니다</h2></div><span>{form.selectedQuestionIds.length}개</span></header>{groups.map(([sectionId, group]) => <div className={styles.sectionAccordion} key={sectionId}><button type="button" onClick={() => onToggleSection(sectionId)}><span>{group.title}</span><small>{group.questions.filter((question) => form.selectedQuestionIds.includes(question.id)).length}개</small>{openSections.has(sectionId) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{openSections.has(sectionId) ? <div>{group.questions.map((question) => { const checked = form.selectedQuestionIds.includes(question.id); return <label key={question.id} data-selected={checked || undefined}><input type="checkbox" checked={checked} onChange={() => onToggleQuestion(question.id)} /><i>{question.number}</i><span>{question.text}</span></label>; })}</div> : null}</div>)}</section>;
}

function OrderList({ questions, onReorder }: { questions: InterviewQuestion[]; onReorder: (from: number, direction: -1 | 1) => void }) {
  return <section className={styles.orderList}><header><p>선택한 질문 확인</p><h2>현장에서도 이 순서 그대로 진행합니다</h2></header>{questions.length ? <ol>{questions.map((question, index) => <li key={question.id}><span>{index + 1}</span><p>{question.text}</p><div><button type="button" disabled={index === 0} onClick={() => onReorder(index, -1)}>↑</button><button type="button" disabled={index === questions.length - 1} onClick={() => onReorder(index, 1)}>↓</button></div></li>)}</ol> : <p className={styles.empty}>질문을 먼저 선택해주세요.</p>}</section>;
}

export default function MobileInterviewPreparation({
  preparation,
  form,
  clients,
  groups,
  selectedQuestions,
  step,
  infoExpanded,
  openSections,
  saving,
  error,
  onBack,
  onChangeForm,
  onToggleQuestion,
  onToggleSection,
  onReorder,
  onStep,
  onInfoExpanded,
  onSave,
  onReady,
  onStart,
}: {
  preparation: InterviewPreparation | null;
  form: FormValue;
  clients: ClientOption[];
  groups: Array<[string, { title: string; questions: InterviewQuestion[] }]>;
  selectedQuestions: InterviewQuestion[];
  step: PreparationMobileStep;
  infoExpanded: boolean;
  openSections: Set<string>;
  saving: boolean;
  error: string;
  onBack: () => void;
  onChangeForm: (patch: Partial<FormValue>) => void;
  onToggleQuestion: (id: string) => void;
  onToggleSection: (sectionId: string) => void;
  onReorder: (from: number, direction: -1 | 1) => void;
  onStep: (step: PreparationMobileStep) => void;
  onInfoExpanded: (expanded: boolean) => void;
  onSave: () => void;
  onReady: () => void;
  onStart: () => void;
}) {
  if (preparation?.status === "ready" && preparation.current_version_id) {
    return <section className={styles.frame}><StepToolbar step="order" title="인터뷰 준비 완료" count={preparation.selected_questions.length} onBack={onBack} /><section className={styles.ready}><i><Check size={28} /></i><h2>인터뷰 준비가 완료되었습니다.</h2><dl><div><dt>병원명</dt><dd>{preparation.hospital_name}</dd></div><div><dt>인터뷰 대상</dt><dd>{preparation.interviewee_name}</dd></div><div><dt>인터뷰 예정일</dt><dd>{preparation.interview_date || "미정"}</dd></div><div><dt>선택 질문 수</dt><dd>{preparation.selected_questions.length}개</dd></div></dl><p>✓ 질문 선택 완료<br />✓ 준비 정보 저장 완료<br />✓ PDF 생성 완료</p><div className={styles.readyLinks}><a href={`/api/voice/interviews/preparations/${preparation.id}/pdf?preview=html`} target="_blank" rel="noreferrer">PDF 보기</a><a href={`/api/voice/interviews/preparations/${preparation.id}/pdf`} target="_blank" rel="noreferrer"><FileDown size={15} />PDF 다운로드</a></div><button type="button" className={styles.readyStart} onClick={onStart}><Mic size={17} />인터뷰 열기</button></section></section>;
  }

  const title = step === "info" ? "인터뷰 정보" : step === "questions" ? "질문 선택" : "선택 질문 확인";
  const readyLabel = saving ? "질문지 생성 중…" : "준비 완료";
  return <section className={styles.frame}><StepToolbar step={step} title={title} count={selectedQuestions.length} onBack={onBack} />{error ? <p className={styles.error}>{error}</p> : null}{step === "info" ? <InterviewFields form={form} clients={clients} onChange={onChangeForm} /> : null}{step === "questions" ? <><section className={styles.infoSummary}>{infoExpanded ? <><InterviewFields form={form} clients={clients} onChange={onChangeForm} /><button type="button" onClick={() => onInfoExpanded(false)}>정보 접기</button></> : <><div><strong>{form.hospitalName || "병원명 미입력"}</strong><span>{form.intervieweeName || "인터뷰 대상 미입력"} · {formatDate(form.interviewDate)}</span></div><button type="button" onClick={() => onInfoExpanded(true)}>정보 수정</button></>}</section><QuestionPicker groups={groups} form={form} openSections={openSections} onToggleSection={onToggleSection} onToggleQuestion={onToggleQuestion} /></> : null}{step === "order" ? <OrderList questions={selectedQuestions} onReorder={onReorder} /> : null}<footer className={styles.actionBar}>{step === "info" ? <><button type="button" onClick={onSave} disabled={saving}> {saving ? "저장 중…" : "초안 저장"}</button><button type="button" className={styles.primary} onClick={() => onStep("questions")}>다음: 질문 선택</button></> : null}{step === "questions" ? <><span>{selectedQuestions.length}개 선택</span><button type="button" className={styles.primary} onClick={() => onStep("order")}>선택 질문 확인</button></> : null}{step === "order" ? <><button type="button" onClick={() => onStep("questions")}>질문 다시 선택</button><button type="button" className={styles.primary} disabled={saving} onClick={onReady}>{readyLabel}</button></> : null}</footer></section>;
}
