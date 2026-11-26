"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Mail, RefreshCcw } from "lucide-react";
import type { StatementReceiptMode } from "@/lib/quote/transactionStatementDetails";
import { transactionStatementPath } from "@/lib/quote/transactionStatementSnapshot";
import {
  DOCUMENT_MAIL_LABELS, type DocumentMailChoice, type DocumentMailKind, type DocumentMailPreview, type DocumentMailProgress, type DocumentMailReference, type DocumentMailSelection,
} from "@/lib/document-mail/shared";
import styles from "./DocumentMail.module.css";

export const DOCUMENT_MAIL_ENDPOINT = "/api/admin/document-mail";
const KINDS = Object.keys(DOCUMENT_MAIL_LABELS) as DocumentMailKind[];
const PHASES = {
  saving: "문서 저장 확인 중…",
  preparing: "PDF 준비 중…",
  sending: "메일 보내는 중…",
  checking: "발송 상태 확인 중…",
};

type EmailFields = { confirmed: true; to: string; subject: string; message: string };
type BundleRequest = EmailFields & { anchor: DocumentMailReference; requestId: string; documents: DocumentMailSelection[] };

async function loadProgress(requestId: string) {
  const response = await fetch(`${DOCUMENT_MAIL_ENDPOINT}?requestId=${encodeURIComponent(requestId)}`, {
    cache: "no-store", signal: AbortSignal.timeout(5_000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error("발송 상태를 불러오지 못했습니다.");
  return data.progress as DocumentMailProgress | null;
}

async function postMail(endpoint: string, body: object) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(75_000),
  });
  return { response, result: await response.json().catch(() => null) };
}

async function saveBeforeSending(saveEditor: () => Promise<boolean>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      saveEditor(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("문서 저장 응답이 늦습니다. 저장 상태를 확인해 주세요.")), 15_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export default function DocumentMailPanel({ anchor, preview, preferredContractId, refresh, saveEditor }: {
  anchor: DocumentMailReference;
  preview: DocumentMailPreview;
  preferredContractId?: string;
  refresh: (signal?: AbortSignal) => Promise<DocumentMailPreview>;
  saveEditor: () => Promise<boolean>;
}) {
  const titleId = useId();
  const submitting = useRef(false);
  const [selection, setSelection] = useState<Partial<Record<DocumentMailKind, string | null>>>({});
  const [receiptMode, setReceiptMode] = useState<"bundle" | StatementReceiptMode>("bundle");
  const [phase, setPhase] = useState<keyof typeof PHASES | null>(null);
  const [pending, setPending] = useState<BundleRequest | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const sending = phase !== null;
  const locked = sending || pending !== null;
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

  useEffect(() => {
    if (!pending || phase !== "preparing") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll(requestId: string) {
      const status = await loadProgress(requestId).catch(() => null);
      if (!active) return;
      if (status?.state === "sending") setPhase((current) => current === "preparing" ? "sending" : current);
      else if (status?.state !== "sent" && status?.state !== "failed") timer = setTimeout(() => void poll(requestId), 3000);
    }
    timer = setTimeout(() => void poll(pending.requestId), 3000);
    return () => { active = false; clearTimeout(timer); };
  }, [pending, phase]);

  async function reload() {
    setError("");
    try { await refresh(AbortSignal.timeout(10_000)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "문서를 불러오지 못했습니다."); }
  }

  function finish(to: string, count: number, warning?: string) {
    setSent(warning || `${to}에 문서 ${count}건을 보냈습니다.`);
    setError("");
    setPending(null);
    setRetryAvailable(false);
    void refresh(AbortSignal.timeout(10_000)).catch((cause) => console.error("[document-portal] mail status refresh failed", cause));
  }

  async function reconcile(request: BundleRequest) {
    try {
      const status = await loadProgress(request.requestId);
      if (status?.state === "sent") {
        finish(request.to, status.documentCount || request.documents.length);
        return;
      }
      if (status?.state === "failed") {
        setPending(null);
        setRetryAvailable(false);
        setError("메일을 보내지 못했습니다. 내용을 확인한 뒤 다시 시도해 주세요.");
        return;
      }
      setRetryAvailable(status === null);
      setError(status === null
        ? "발송 기록이 아직 없습니다. 같은 요청을 다시 시도할 수 있습니다."
        : status.state === "preparing" ? "PDF를 준비하고 있습니다. 잠시 후 발송 상태를 다시 확인해 주세요."
          : "메일 서버의 응답을 확인 중입니다. 잠시 후 발송 상태를 다시 확인해 주세요.");
    } catch {
      setError("발송 결과를 확인하지 못했습니다. 잠시 후 발송 상태를 다시 확인해 주세요.");
    }
  }

  async function sendBundle(request: BundleRequest) {
    setPending(request);
    setRetryAvailable(false);
    setPhase("preparing");
    const delivery = await postMail(DOCUMENT_MAIL_ENDPOINT, request).catch(() => null);
    if (delivery?.response.ok && delivery.result?.ok) {
      finish(request.to, delivery.result.documentCount ?? request.documents.length, delivery.result.recordingWarning);
      return;
    }
    if (delivery?.result && (delivery.result.code === "NOT_SENT" || delivery.response.status < 500 && delivery.result.code !== "IN_PROGRESS")) {
      setPending(null);
      throw new Error(delivery.result.error || "메일을 보내지 못했습니다.");
    }
    setPhase("checking");
    await reconcile(request);
  }

  async function run(phase: keyof typeof PHASES, action: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setPhase(phase);
    setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "메일을 보내지 못했습니다."); }
    finally { submitting.current = false; setPhase(null); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!documents.length || sent || pending) return;
    const form = new FormData(event.currentTarget);
    const fields = { confirmed: true as const, to: String(form.get("to") || ""), subject: String(form.get("subject") || ""), message: String(form.get("message") || "") };
    void run("saving", async () => {
      if (!await saveBeforeSending(saveEditor)) throw new Error("현재 문서를 저장하지 못했습니다. 저장 상태를 확인해 주세요.");
      const latest = await refresh(AbortSignal.timeout(10_000));
      if (documents.some((document) => !sameDocumentVersion(document, latest.documents))) {
        throw new Error("최신 문서로 갱신했습니다. 보낼 문서를 확인한 뒤 다시 보내 주세요.");
      }

      if (receiptStatement && activeReceiptMode !== "bundle") {
        setPhase("preparing");
        const delivery = await postMail(`${transactionStatementPath(receiptStatement.id)}/send`, {
          ...fields, mode: activeReceiptMode, updatedAt: receiptStatement.version,
        }).catch(() => null);
        if (!delivery?.response.ok || !delivery.result?.ok) {
          throw new Error(delivery?.result?.error || "발송 결과를 확인하지 못했습니다. 거래명세서의 발송 상태를 먼저 확인해 주세요.");
        }
        finish(fields.to, 1, delivery.result.recordingWarning);
        window.dispatchEvent(new CustomEvent("olivia-statement-sent", { detail: receiptStatement.id }));
        return;
      }
      await sendBundle({
        ...fields, anchor, requestId: crypto.randomUUID(),
        documents: documents.map(({ kind, id, version }) => ({ kind, id, version })),
      });
    });
  }

  return <aside className={styles.panel} aria-labelledby={titleId}>
    <header className={styles.header}>
      <h2 id={titleId}>메일 보내기</h2>
      <button type="button" className={styles.iconButton} disabled={sending} onClick={() => void reload()} aria-label="문서와 발송 기록 새로고침" title="문서와 발송 기록 새로고침"><RefreshCcw size={15} /></button>
    </header>
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>받는 메일 주소<input name="to" type="email" defaultValue={preview.recipient} maxLength={254} required readOnly={locked} /></label>
      <label className={styles.field}>제목<input name="subject" defaultValue={preview.subject} maxLength={200} required readOnly={locked} /></label>
      <label className={styles.field}>내용<textarea name="message" defaultValue={preview.message} rows={4} maxLength={5000} required readOnly={locked} /></label>
      <fieldset className={styles.selection} disabled={locked}>
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
      {receiptStatement ? <label className={styles.field}>거래명세서 발송 방식<select disabled={locked} value={activeReceiptMode} onChange={(event) => {
        const value = event.target.value;
        setReceiptMode(value === "confirm" || value === "sign" ? value : "bundle");
      }}>
        <option value="bundle">문서함 링크</option>
        <option value="confirm">수신확인 요청</option>
        <option value="sign">서명 요청</option>
      </select></label> : null}
      {preview.latest && <p className={styles.notice}>최근 발송 · {preview.latest.recipient} · {new Date(preview.latest.sentAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>}
      <p className={styles.notice}>{activeReceiptMode !== "bundle" ? "거래명세서 PDF와 확인 링크를 보냅니다." : documents.length ? "고객은 메일의 문서함에서 선택한 문서를 확인하고 내려받을 수 있습니다." : "보낼 문서를 선택해 주세요."}</p>
      <div className={styles.actions}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {sent && <p className={styles.notice} role="status">{sent}</p>}
        {sent ? <button className={styles.button} type="button" onClick={() => setSent(null)}>새 메일 작성</button>
          : pending && !sending ? <>
            <button className={styles.button} type="button" onClick={() => void run("checking", () => reconcile(pending))}>발송 상태 확인</button>
            {retryAvailable && <button className={`${styles.button} ${styles.primary}`} type="button" onClick={() => void run("preparing", () => sendBundle(pending))}>같은 요청 다시 시도</button>}
          </> : <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={!documents.length || sending}>
            <Mail size={15} aria-hidden /> <span aria-live="polite">{phase ? PHASES[phase] : `선택한 문서 ${documents.length}건 보내기`}</span>
          </button>}
      </div>
    </form>
  </aside>;
}

function sameDocumentVersion(document: DocumentMailChoice, latest: DocumentMailChoice[]) {
  return latest.some((candidate) => document.kind === candidate.kind && document.id === candidate.id && document.version === candidate.version
    && document.requiresSignature === candidate.requiresSignature && document.canRequestReceipt === candidate.canRequestReceipt);
}
