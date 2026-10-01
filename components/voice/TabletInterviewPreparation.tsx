"use client";

import { ArrowLeft, Check, ChevronDown, ChevronUp, FileDown, ListChecks, Mic } from "lucide-react";
import type { InterviewPreparation, InterviewQuestion } from "@/lib/voice/interview/types";
import styles from "./TabletInterviewPreparation.module.css";

export type TabletPreparationStep = "questions" | "order";

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
  return year && month && day ? `${year}. ${Number(month)}. ${Number(day)}.` : value;
}

function InterviewFields({ form, clients, onChange }: {
  form: FormValue;
  clients: ClientOption[];
  onChange: (patch: Partial<FormValue>) => void;
}) {
  return <section className={styles.infoCard}>
    <h2>인터뷰 정보</h2>
    <label>등록 고객 <small>(선택)</small>
      <select value={form.clientId} onChange={(event) => {
        const client = clients.find((item) => item.id === event.target.value);
        onChange({ clientId: event.target.value, hospitalName: client?.hospitalName || form.hospitalName });
      }}>
        <option value="">고객 연결 안 함</option>
        {clients.map((client) => <option key={client.id} value={client.id}>{client.hospitalName}</option>)}
      </select>
    </label>
    <label>병원명
      <input value={form.hospitalName} onChange={(event) => onChange({ hospitalName: event.target.value })} placeholder="운정표병원" />
    </label>
    <label>인터뷰 대상
      <input value={form.intervieweeName} onChange={(event) => onChange({ intervieweeName: event.target.value })} placeholder="표진규 원장님" />
    </label>
    <label>인터뷰 예정일
      <input type="date" value={form.interviewDate} onChange={(event) => onChange({ interviewDate: event.target.value })} />
    </label>
    <p>고객과 프로젝트는 명시적으로 선택한 경우에만 연결됩니다.</p>
  </section>;
}

function QuestionPicker({ groups, form, openSections, onToggleSection, onToggleQuestion }: {
  groups: Array<[string, { title: string; questions: InterviewQuestion[] }]>;
  form: FormValue;
  openSections: Set<string>;
  onToggleSection: (sectionId: string) => void;
  onToggleQuestion: (id: string) => void;
}) {
  return <section className={styles.questionPicker}>
    <header className={styles.questionHeader}>
      <div>
        <p>35개 질문 중 선택</p>
        <h2>5~7개 질문을 추천합니다</h2>
      </div>
      <span>{form.selectedQuestionIds.length}개 선택</span>
    </header>
    {groups.map(([sectionId, group], groupIndex) => {
      const checkedCount = group.questions.filter((question) => form.selectedQuestionIds.includes(question.id)).length;
      const open = openSections.has(sectionId);
      return <div className={styles.sectionAccordion} key={sectionId}>
        <button type="button" onClick={() => onToggleSection(sectionId)} aria-expanded={open}>
          <b>{groupIndex + 1}</b>
          <span>{group.title}</span>
          <small>{checkedCount}개</small>
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {open ? <div className={styles.questionList}>
          {group.questions.map((question) => {
            const checked = form.selectedQuestionIds.includes(question.id);
            return <label key={question.id} data-selected={checked || undefined}>
              <input type="checkbox" checked={checked} onChange={() => onToggleQuestion(question.id)} />
              <i>{question.number}</i>
              <span>{question.text}</span>
            </label>;
          })}
        </div> : null}
      </div>;
    })}
  </section>;
}

function OrderList({ questions, onReorder }: {
  questions: InterviewQuestion[];
  onReorder: (from: number, direction: -1 | 1) => void;
}) {
  return <section className={styles.orderCard}>
    <header>
      <div>
        <p>선택한 질문 확인</p>
        <h2>현장에서도 이 순서 그대로 진행합니다</h2>
      </div>
      <span>총 {questions.length}개</span>
    </header>
    {questions.length ? <ol>
      {questions.map((question, index) => <li key={question.id}>
        <span>{index + 1}</span>
        <p>{question.text}</p>
        <div>
          <button type="button" disabled={index === 0} onClick={() => onReorder(index, -1)} aria-label={`${index + 1}번 질문 위로 이동`}>↑</button>
          <button type="button" disabled={index === questions.length - 1} onClick={() => onReorder(index, 1)} aria-label={`${index + 1}번 질문 아래로 이동`}>↓</button>
        </div>
      </li>)}
    </ol> : <p className={styles.empty}>질문을 먼저 선택해주세요.</p>}
  </section>;
}

function ReadyScreen({ preparation, onBack, onStart }: {
  preparation: InterviewPreparation;
  onBack: () => void;
  onStart: () => void;
}) {
  return <section className={styles.readyFrame}>
    <header className={styles.toolbar}>
      <button type="button" onClick={onBack}><ArrowLeft size={17} />준비 목록</button>
      <div><p>INTERVIEW READY</p><h1>인터뷰 준비 완료</h1></div>
      <span />
    </header>
    <div className={styles.readyContent}>
      <i><Check size={29} /></i>
      <h2>인터뷰 준비가 완료되었습니다</h2>
      <p>선택한 {preparation.selected_questions.length}개의 질문으로 인터뷰를 진행할 수 있습니다.</p>
      <article>
        <div className={styles.readyThumbnail}><ListChecks size={28} /></div>
        <div>
          <strong>{preparation.hospital_name}</strong>
          <span>{preparation.interviewee_name}</span>
          <small>{formatDate(preparation.interview_date || "")}</small>
        </div>
        <button type="button" onClick={onBack}>정보 수정</button>
      </article>
      <div className={styles.readyActions}>
        <a href={`/api/voice/interviews/preparations/${preparation.id}/pdf?preview=html`} target="_blank" rel="noreferrer">PDF 미리보기</a>
        <a href={`/api/voice/interviews/preparations/${preparation.id}/pdf`} target="_blank" rel="noreferrer"><FileDown size={17} />PDF 다운로드</a>
        <button type="button" onClick={onStart}><Mic size={18} />인터뷰 열기</button>
      </div>
      <small className={styles.readyNotice}>준비 완료 후 내용을 수정하면 초안으로 돌아갑니다.</small>
    </div>
  </section>;
}

export default function TabletInterviewPreparation({
  preparation,
  form,
  clients,
  groups,
  selectedQuestions,
  step,
  openSections,
  saving,
  error,
  onBack,
  onChangeForm,
  onToggleQuestion,
  onToggleSection,
  onReorder,
  onStep,
  onSave,
  onReady,
  onStart,
}: {
  preparation: InterviewPreparation | null;
  form: FormValue;
  clients: ClientOption[];
  groups: Array<[string, { title: string; questions: InterviewQuestion[] }]>;
  selectedQuestions: InterviewQuestion[];
  step: TabletPreparationStep;
  openSections: Set<string>;
  saving: boolean;
  error: string;
  onBack: () => void;
  onChangeForm: (patch: Partial<FormValue>) => void;
  onToggleQuestion: (id: string) => void;
  onToggleSection: (sectionId: string) => void;
  onReorder: (from: number, direction: -1 | 1) => void;
  onStep: (step: TabletPreparationStep) => void;
  onSave: () => void;
  onReady: () => void;
  onStart: () => void;
}) {
  if (preparation?.status === "ready" && preparation.current_version_id) {
    return <ReadyScreen preparation={preparation} onBack={onBack} onStart={onStart} />;
  }

  const questionStep = step === "questions";
  return <section className={styles.frame}>
    <header className={styles.toolbar}>
      <button type="button" onClick={onBack}><ArrowLeft size={17} />{questionStep ? "준비 목록" : "질문 선택"}</button>
      <div>
        <p>{questionStep ? "INTERVIEW PREPARATION" : "SELECTED QUESTION ORDER"}</p>
        <h1>{questionStep ? "인터뷰 준비 / 질문 선택" : "선택 질문 순서 편집"}</h1>
      </div>
      <span>{questionStep ? `${selectedQuestions.length}개 선택` : `총 ${selectedQuestions.length}개`}</span>
    </header>
    {error ? <p className={styles.error}>{error}</p> : null}
    {questionStep ? <div className={styles.selectionLayout}>
      <InterviewFields form={form} clients={clients} onChange={onChangeForm} />
      <QuestionPicker groups={groups} form={form} openSections={openSections} onToggleSection={onToggleSection} onToggleQuestion={onToggleQuestion} />
    </div> : <OrderList questions={selectedQuestions} onReorder={onReorder} />}
    <footer className={styles.actionBar}>
      {questionStep ? <>
        <button type="button" disabled={saving} onClick={onSave}>{saving ? "저장 중…" : "초안 저장"}</button>
        <span>{selectedQuestions.length}개 선택</span>
        <button type="button" className={styles.primary} onClick={() => onStep("order")}>선택 질문 확인</button>
      </> : <>
        <button type="button" onClick={() => onStep("questions")}>질문 다시 선택</button>
        <button type="button" disabled={saving} onClick={onSave}>{saving ? "저장 중…" : "초안 저장"}</button>
        <button type="button" className={styles.primary} disabled={saving} onClick={onReady}>{saving ? "질문지 생성 중…" : "준비 완료"}</button>
      </>}
    </footer>
  </section>;
}
