"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Mail, RefreshCcw } from "lucide-react";
import type { StatementReceiptMode } from "@/lib/quote/transactionStatementDetails";
import { transactionStatementPath } from "@/lib/quote/transactionStatementSnapshot";
import {
  DOCUMENT_MAIL_LABELS, type DocumentMailChoice, type DocumentMailKind, type DocumentMailPreview, type DocumentMailReference,
} from "@/lib/document-mail/shared";
import styles from "./DocumentMail.module.css";

export const DOCUMENT_MAIL_ENDPOINT = "/api/admin/document-mail";
const KINDS = Object.keys(DOCUMENT_MAIL_LABELS) as DocumentMailKind[];

export default function DocumentMailPanel({ anchor, preview, preferredContractId, refresh, saveEditor }: {
  anchor: DocumentMailReference;
  preview: DocumentMailPreview;
  preferredContractId?: string;
  refresh: () => Promise<DocumentMailPreview>;
  saveEditor: () => Promise<boolean>;
}) {
  const titleId = useId();
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const [selection, setSelection] = useState<Partial<Record<DocumentMailKind, string | null>>>({});
  const [receiptMode, setReceiptMode] = useState<"bundle" | StatementReceiptMode>("bundle");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const contracts = preview.documents.filter((document) => document.kind === "contract");
  const defaultContract = anchor.kind === "statement" ? null
    : contracts.find((document) => document.id === (anchor.kind === "contract" ? anchor.id : preferredContractId)) ?? (contracts.length === 1 ? contracts[0] : null);
  const defaultContractId = defaultContract?.id;
  useEffect(() => {
    if (defaultContractId) setSelection((current) => current.contract === undefined ? { ...current, contract: defaultContractId } : current);
  }, [defaultContractId]);
  const defaultSelection = { [anchor.kind]: anchor.id, ...(defaultContract && { contract: defaultContract.id }) };
  const selected = { ...defaultSelection, ...selection };
  const documents = preview.documents.filter((document) => selected[document.kind] === document.id);
  const receiptStatement = documents.length === 1 && documents[0].canRequestReceipt ? documents[0] : null;
  const activeReceiptMode = receiptStatement ? receiptMode : "bundle";

  async function reload() {
    setError("");
    try { await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "문서를 불러오지 못했습니다."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !documents.length || sent) return;
    const form = new FormData(event.currentTarget);
    const fields = { confirmed: true, to: form.get("to"), subject: form.get("subject"), message: form.get("message") };
    submitting.current = true;
    setSending(true);
    setError("");
    try {
      if (!await saveEditor()) throw new Error("현재 문서를 저장하지 못했습니다. 저장 상태를 확인해 주세요.");
      const latest = await refresh();
      if (documents.some((document) => !sameDocumentVersion(document, latest.documents))) {
        throw new Error("최신 문서로 갱신했습니다. 보낼 문서를 확인한 뒤 다시 보내 주세요.");
      }

      const receipt = receiptStatement && activeReceiptMode !== "bundle";
      const body = receipt
        ? { ...fields, mode: activeReceiptMode, updatedAt: receiptStatement.version }
        : { ...fields, anchor, requestId: requestId.current ??= crypto.randomUUID(), documents: documents.map(({ kind, id, version }) => ({ kind, id, version })) };
      const response = await fetch(receipt ? `${transactionStatementPath(receiptStatement.id)}/send` : DOCUMENT_MAIL_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        if (result?.code === "NOT_SENT") requestId.current = null;
        throw new Error(result?.error || "발송 결과를 확인할 수 없습니다. 잠시 후 같은 요청을 확인해 주세요.");
      }
      setSent(result.recordingWarning || `${String(fields.to)}에 문서 ${result.documentCount ?? 1}건을 보냈습니다.`);
      requestId.current = null;
      void refresh().catch((cause) => console.error("[document-portal] mail status refresh failed", cause));
      if (receipt) window.dispatchEvent(new CustomEvent("olivia-statement-sent", { detail: receiptStatement.id }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "메일을 보내지 못했습니다.");
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }

  return <aside className={styles.panel} aria-labelledby={titleId}>
    <header className={styles.header}>
      <h2 id={titleId}>메일 보내기</h2>
      <button type="button" className={styles.iconButton} disabled={sending} onClick={() => void reload()} aria-label="문서와 발송 기록 새로고침" title="문서와 발송 기록 새로고침"><RefreshCcw size={15} /></button>
    </header>
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.field}>받는 메일 주소<input name="to" type="email" defaultValue={preview.recipient} maxLength={254} required readOnly={sending} /></label>
      <label className={styles.field}>제목<input name="subject" defaultValue={preview.subject} maxLength={200} required readOnly={sending} /></label>
      <label className={styles.field}>내용<textarea name="message" defaultValue={preview.message} rows={4} maxLength={5000} required readOnly={sending} /></label>
      <fieldset className={styles.selection} disabled={sending}>
        <legend>함께 보낼 문서</legend>
        {KINDS.map((kind) => {
          const choices = preview.documents.filter((document) => document.kind === kind);
          if (!choices.length) return <label className={`${styles.choice} ${styles.unavailable}`} key={kind}>
            <input type="checkbox" disabled /> <span>{DOCUMENT_MAIL_LABELS[kind]}<small className={styles.small}>연결된 문서가 없습니다.</small></span>
          </label>;
          return choices.map((choice) => <label className={styles.choice} key={choice.id}>
            <input type="checkbox" checked={selected[kind] === choice.id} onChange={(event) => {
              setReceiptMode("bundle");
              setSelection((current) => ({ ...current, [kind]: event.target.checked ? choice.id : null }));
            }} />
            <span><strong>{DOCUMENT_MAIL_LABELS[kind]}</strong> {choice.number}
              <small className={styles.small}>{choice.title}{choice.requiresSignature ? " · 전자서명 요청" : kind === "contract" ? " · 서명본" : ""}</small></span>
          </label>);
        })}
      </fieldset>
      {receiptStatement ? <label className={styles.field}>거래명세서 발송 방식<select disabled={sending} value={activeReceiptMode} onChange={(event) => {
        const value = event.target.value;
        setReceiptMode(value === "confirm" || value === "sign" ? value : "bundle");
      }}>
        <option value="bundle">문서함 링크</option>
        <option value="confirm">수신확인 요청</option>
        <option value="sign">서명 요청</option>
      </select></label> : null}
      {preview.latest && <p className={styles.notice}>최근 발송 · {preview.latest.recipient} · {new Date(preview.latest.sentAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>}
      <p className={styles.notice}>{activeReceiptMode !== "bundle" ? "거래명세서 PDF와 확인 링크를 보냅니다." : documents.length ? "고객은 메일의 문서함에서 선택한 문서를 확인하고 내려받을 수 있습니다." : "보낼 문서를 선택해 주세요."}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {sent && <p className={styles.notice} role="status">{sent}</p>}
      <div className={styles.actions}>
        {sent ? <button className={styles.button} type="button" onClick={() => setSent(null)}>새 메일 작성</button>
          : <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={!documents.length || sending}>
            <Mail size={15} aria-hidden /> {sending ? "보내는 중…" : `선택한 문서 ${documents.length}건 보내기`}
          </button>}
      </div>
    </form>
  </aside>;
}

function sameDocumentVersion(document: DocumentMailChoice, latest: DocumentMailChoice[]) {
  return latest.some((candidate) => document.kind === candidate.kind && document.id === candidate.id && document.version === candidate.version
    && document.requiresSignature === candidate.requiresSignature && document.canRequestReceipt === candidate.canRequestReceipt);
}
