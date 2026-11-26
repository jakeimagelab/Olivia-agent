"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, FileText, Mail, Paperclip, PenLine, Plus, RefreshCcw } from "lucide-react";
import Modal from "@/components/ui/Modal";
import DocumentMailPanel from "@/components/document-mail/DocumentMailPanel";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";
import {
  createQuoteStatement, loadStatementPdf, loadStatementWorkspace, openQuoteStatement, statementRequest,
  type StatementWorkspaceOpening, type StatementWorkspaceResponse,
} from "@/lib/quote/transactionStatementClient";
import {
  STATEMENT_BUSINESS_FIELDS, STATEMENT_REGISTRATION_ACCEPT, STATEMENT_REGISTRATION_LIMIT,
  type StatementBusinessDetails, type StatementBusinessParty, type StatementPartyKey,
  type StatementReceiptMode, type StatementSummary, type StatementWorkspaceData,
} from "@/lib/quote/transactionStatementDetails";
import { transactionStatementPath } from "@/lib/quote/transactionStatementSnapshot";
import { TransactionStatementMailForm } from "./TransactionStatementForms";
import { TransactionStatementDraftPreview } from "./TransactionStatementDraftPreview";
import { TransactionStatementPdfPreview } from "./TransactionStatementPdfPreview";
import styles from "./TransactionStatement.module.css";

const partyLabels = { supplier: "공급자", recipient: "공급받는자" };

function statementStatus(statement: Pick<StatementSummary, "status" | "receipt_mode">) {
  if (statement.status === "draft") return "작성 중";
  const signing = statement.receipt_mode === "sign";
  if (statement.status === "confirmed") return signing ? "서명 완료" : "수신확인 완료";
  return signing ? "서명 대기" : "수신확인 대기";
}

function PartyPanel({ party, details, disabled, registrationName, registrationUrl, onChange, onAttach }: {
  party: StatementPartyKey;
  details: StatementBusinessParty;
  disabled: boolean;
  registrationName?: string;
  registrationUrl: string;
  onChange: (key: keyof StatementBusinessParty, value: string) => void;
  onAttach: (file: File) => void;
}) {
  return <fieldset className={styles.partyPanel} disabled={disabled}>
    <legend>{partyLabels[party]}</legend>
    <div className={styles.businessFields}>
      {STATEMENT_BUSINESS_FIELDS.map(({ key, label, max }) => (
        <label className={styles.field} data-wide={key === "address" || key === "email" || undefined} key={key}>
          <span>{label}{(key === "businessCategory" || key === "businessItem") && <small className={styles.optionalField}>선택</small>}</span>
          <input maxLength={max} type={key === "email" ? "email" : "text"} value={details[key]}
            onChange={(event) => onChange(key, event.target.value)} />
        </label>
      ))}
    </div>
    <div className={styles.registration}>
      <div><strong>사업자등록증</strong><small>PDF · JPG · PNG · 4MB 이하</small></div>
      {registrationName ? <a href={registrationUrl} className={styles.registrationName} title={registrationName}><Paperclip size={14} />{registrationName}</a> : null}
      <label className={styles.uploadLabel} aria-disabled={disabled}>
        <Paperclip size={15} />{registrationName ? "첨부 바꾸기" : "파일 첨부"}
        <input aria-label={`${partyLabels[party]} 사업자등록증 첨부`} type="file" accept={STATEMENT_REGISTRATION_ACCEPT} onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onAttach(file);
        }} />
      </label>
    </div>
  </fieldset>;
}

export default function TransactionStatementWorkspace({ opening, quoteId, onBack, embedded }: {
  opening: Promise<StatementWorkspaceOpening>;
  quoteId: string;
  onBack: () => void;
  embedded: boolean;
}) {
  const [history, setHistory] = useState<StatementSummary[]>([]);
  const [statement, setStatement] = useState<StatementWorkspaceData | null>(null);
  const [draft, setDraft] = useState<StatementBusinessDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mailMode, setMailMode] = useState<StatementReceiptMode | null>(null);
  const [mailStatementId, setMailStatementId] = useState<string | null>(null);
  const selectedId = statement?.id;
  const endpoint = selectedId ? transactionStatementPath(selectedId) : "";
  const editable = statement?.status === "draft" && !statement.sending;
  const dirty = editable && JSON.stringify(draft) !== JSON.stringify(statement.businessDetails);

  const showError = useCallback((cause: unknown) => setError(cause instanceof Error ? cause.message : "거래명세서를 처리하지 못했습니다."), []);
  const applySaved = useCallback((value: StatementWorkspaceData) => {
    setStatement(value);
    setDraft(value.businessDetails);
    setHistory((previous) => previous.map((entry) => entry.id === value.id
      ? { ...entry, status: value.status, receipt_mode: value.receiptMode }
      : entry));
  }, []);

  const applyOpening = useCallback(({ statement: current, statements }: StatementWorkspaceOpening) => {
    setHistory(statements);
    applySaved(current);
  }, [applySaved]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!selectedId) {
      applyOpening(await openQuoteStatement(quoteId));
      return;
    }
    const { statement: current } = await loadStatementWorkspace(selectedId, signal);
    if (!signal?.aborted) applySaved(current);
  }, [applyOpening, applySaved, quoteId, selectedId]);

  useEffect(() => {
    let active = true;
    void opening.then((value) => { if (active) applyOpening(value); })
      .catch((cause) => { if (active) showError(cause); });
    return () => { active = false; };
  }, [applyOpening, opening, showError]);

  const awaitingReceipt = statement?.status === "sent";
  useEffect(() => {
    if (!awaitingReceipt) return;
    const controller = new AbortController();
    const check = () => {
      if (document.visibilityState === "visible") void refresh(controller.signal).catch((cause) => { if (!controller.signal.aborted) showError(cause); });
    };
    const interval = window.setInterval(check, 12_000);
    window.addEventListener("focus", check);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", check); };
  }, [awaitingReceipt, refresh, showError]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(); }
    catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }

  async function saveIfDirty() {
    if (!statement || !draft) throw new Error("거래명세서를 불러오는 중입니다.");
    if (!dirty) return statement;
    const { statement: saved } = await statementRequest<StatementWorkspaceResponse>(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessDetails: draft, updatedAt: statement.updatedAt }),
    });
    applySaved(saved);
    setNotice("사업자 정보를 저장했습니다.");
    return saved;
  }

  const save = () => void perform(async () => { await saveIfDirty(); });
  useSaveShortcut(save, Boolean(editable && !mailMode));

  const canLeave = () => !busy && (!dirty || window.confirm("저장하지 않은 사업자 정보가 있습니다. 이 화면에서 나갈까요?"));
  const switchStatement = (next: string) => {
    if (next === selectedId || !canLeave()) return;
    void perform(async () => applySaved((await loadStatementWorkspace(next)).statement));
  };
  const createNew = () => {
    if (!canLeave()) return;
    void perform(async () => {
      const { statement: next } = await createQuoteStatement(quoteId);
      setHistory((previous) => [next, ...previous]);
      applySaved((await loadStatementWorkspace(next.id)).statement);
    });
  };
  const attach = (party: StatementPartyKey, file: File) => void perform(async () => {
    if (file.size > STATEMENT_REGISTRATION_LIMIT) throw new Error("사업자등록증은 4MB 이하로 첨부해 주세요.");
    const current = await saveIfDirty();
    const form = new FormData();
    form.append("file", file); form.append("party", party); form.append("updatedAt", current.updatedAt);
    const { statement: saved } = await statementRequest<StatementWorkspaceResponse>(`${endpoint}/registration`, { method: "POST", body: form });
    applySaved(saved);
    setNotice(`${partyLabels[party]} 사업자등록증을 저장했습니다.`);
  });
  const download = () => void perform(async () => {
    const current = await saveIfDirty();
    const pdf = await loadStatementPdf(`${endpoint}/pdf?download=1`);
    const url = URL.createObjectURL(pdf);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${current.number}${current.status === "confirmed" && current.receiptMode === "sign" ? "-signed" : ""}.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const startMail = (mode: StatementReceiptMode) => void perform(async () => { await saveIfDirty(); setMailMode(mode); });

  const isSigned = statement?.status === "confirmed" && statement.receiptMode === "sign";

  return <main className={styles.editor} data-embedded={embedded || undefined}>
    <header className={styles.editorHeader}>
      <button className={styles.secondary} type="button" disabled={busy} onClick={() => { if (canLeave()) onBack(); }}><ArrowLeft size={16} /> 견적서</button>
      <div className={styles.editorTitle}>
        <h1>거래명세서</h1>
        {statement ? <p>{statement.number} · 견적서 {statement.quoteNumber}</p> : null}
      </div>
      {statement ? <span className={styles.state} role="status">
        {statement.sending ? "발송 중" : statementStatus({ status: statement.status, receipt_mode: statement.receiptMode })}
        {statement.confirmedBy && statement.confirmedAt ? ` · ${statement.confirmedBy} · ${new Date(statement.confirmedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : ""}
      </span> : null}
      <div className={styles.actions}>
        {history.length > 1 ? <select className={styles.documentSelect} aria-label="거래명세서 기록" value={selectedId} disabled={busy} onChange={(event) => switchStatement(event.target.value)}>
          {history.map((entry) => <option key={entry.id} value={entry.id}>{entry.statement_number} · {statementStatus(entry)}</option>)}
        </select> : null}
        <button className={styles.secondary} type="button" onClick={createNew} disabled={busy || !statement}><Plus size={16} /> 새 거래명세서</button>
      </div>
    </header>
    {error ? <div className={styles.editorNotice} role="alert"><span className={styles.error}>{error}</span>
      <button className={styles.secondary} type="button" disabled={busy} onClick={() => { if (canLeave()) void perform(() => refresh()); }}><RefreshCcw size={14} /> 다시 불러오기</button>
    </div> : notice ? <p className={styles.editorNotice} role="status">{notice}</p> : null}
    {statement && draft ? <div className={styles.editorGrid}>
      <form className={styles.businessPanels} onSubmit={(event) => { event.preventDefault(); save(); }}>
        {(["supplier", "recipient"] as const).map((party) => <PartyPanel key={party} party={party}
          details={draft[party]} disabled={busy || !editable} registrationName={statement.registrationNames[party]}
          registrationUrl={`${endpoint}/registration?party=${party}`}
          onAttach={(file) => attach(party, file)}
          onChange={(key, value) => setDraft((current) => current && { ...current, [party]: { ...current[party], [key]: value } })} />)}
        {editable ? <div className={styles.formActions}>
          <span>{dirty ? "저장할 변경사항이 있습니다." : "저장된 사업자 정보"}</span>
          <button className={styles.primary} type="submit" disabled={busy || !dirty}>{busy ? "처리 중…" : "사업자 정보 저장"}</button>
        </div> : null}
      </form>
      <section className={styles.pdfPanel} aria-label="거래명세서 PDF">
        <div className={styles.pdfToolbar}>
          <h2><FileText size={17} /> {isSigned ? "서명본 PDF" : "PDF 미리보기"}</h2>
          <div className={styles.actions}>
            <button className={styles.secondary} type="button" onClick={download} disabled={busy}><Download size={16} /> {isSigned ? "서명본 다운로드" : "PDF 다운로드"}</button>
            <button className={styles.secondary} type="button" disabled={busy} onClick={() => void perform(async () => {
              const saved = await saveIfDirty();
              setMailStatementId(saved.id);
            })}><Mail size={16} /> 메일 보내기</button>
            {editable ? <>
              <button className={styles.secondary} type="button" onClick={() => startMail("confirm")} disabled={busy}>수신확인 요청</button>
              <button className={styles.secondary} type="button" onClick={() => startMail("sign")} disabled={busy}><PenLine size={16} /> 서명 요청</button>
            </> : null}
          </div>
        </div>
        {statement.status === "draft" && statement.draftPreview
          ? <TransactionStatementDraftPreview number={statement.number} preview={statement.draftPreview} details={draft} />
          : <TransactionStatementPdfPreview source={`${endpoint}/pdf?v=${encodeURIComponent(`${statement.updatedAt}-${statement.status}-${statement.receiptMode}`)}`} />}
      </section>
    </div> : !error ? <div className={styles.editorGrid} aria-busy="true">
      <div className={styles.businessPanels} aria-hidden="true">
        <fieldset className={styles.partyPanel}><legend>공급자</legend></fieldset>
        <fieldset className={styles.partyPanel}><legend>공급받는자</legend></fieldset>
      </div>
      <section className={styles.pdfPanel}>
        <div className={styles.pdfToolbar}><h2><FileText size={17} /> PDF 미리보기</h2></div>
        <div className={`${styles.pdfFrame} ${styles.previewPlaceholder}`} role="status">거래명세서를 준비하는 중…</div>
      </section>
    </div> : null}
    {mailMode && statement ? <Modal open onClose={() => setMailMode(null)} title={mailMode === "sign" ? "서명 요청" : "PDF 보내기"}>
      <TransactionStatementMailForm endpoint={`${endpoint}/send`} mode={mailMode} updatedAt={statement.updatedAt}
        to={statement.businessDetails.recipient.email} subject={mailMode === "sign" ? `${statement.mailSubject} 서명 요청` : statement.mailSubject}
        onSent={(mode) => {
          setMailMode(null);
          applySaved({ ...statement, status: "sent", receiptMode: mode });
          setNotice(mode === "sign" ? "서명 요청 메일을 보냈습니다." : "PDF와 수신확인 링크를 보냈습니다.");
        }} />
    </Modal> : null}
    {mailStatementId ? <DocumentMailPanel anchor={{ kind: "statement", id: mailStatementId }} onClose={() => setMailStatementId(null)} /> : null}
  </main>;
}
