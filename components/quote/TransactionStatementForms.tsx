"use client";

import { useState, type FormEvent } from "react";
import { SignaturePad } from "@/components/ui/SignaturePad";
import type { StatementReceiptMode } from "@/lib/quote/transactionStatementDetails";
import styles from "./TransactionStatement.module.css";

async function submitJson(url: string, data: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(result?.error || "요청을 처리하지 못했습니다.");
  return result;
}

export function TransactionStatementMailForm({
  endpoint, to, subject, canSend = true, unavailableReason, mode, updatedAt, onSent,
}: {
  endpoint: string;
  to: string;
  subject: string;
  canSend?: boolean;
  unavailableReason?: string;
  mode?: StatementReceiptMode;
  updatedAt?: string;
  onSent?: (mode: StatementReceiptMode) => void;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [chosenMode, setChosenMode] = useState<StatementReceiptMode>("confirm");
  const deliveryMode = mode ?? chosenMode;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError("");
    try {
      await submitJson(endpoint, { to: form.get("to"), subject: form.get("subject"), confirmed: true, mode: deliveryMode, updatedAt });
      setSent(true);
      onSent?.(deliveryMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "메일을 발송하지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  if (sent) return <p className={styles.message} role="status">{deliveryMode === "sign" ? "서명 요청 메일을 보냈습니다." : "PDF와 수신확인 링크를 보냈습니다."}</p>;
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.field}>받는 사람<input name="to" type="email" defaultValue={to} maxLength={254} required /></label>
      <label className={styles.field}>제목<input name="subject" defaultValue={subject} maxLength={250} required /></label>
      {mode === undefined ? <label className={styles.field}>발송 방식<select value={chosenMode} onChange={(event) => setChosenMode(event.target.value === "sign" ? "sign" : "confirm")}>
        <option value="confirm">PDF 보내기</option><option value="sign">서명 요청</option>
      </select></label> : null}
      <p className={styles.message}>거래명세서 PDF와 {deliveryMode === "sign" ? "서명 링크" : "수신확인 링크"}를 함께 보냅니다.</p>
      {!canSend ? <p className={styles.message}>{unavailableReason}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button className={styles.primary} type="submit" disabled={!canSend || sending}>{sending ? "보내는 중…" : deliveryMode === "sign" ? "확인하고 서명 요청 보내기" : "확인하고 메일 보내기"}</button>
      </div>
    </form>
  );
}

type Receipt = { confirmedAt: string; confirmedBy: string; signed?: boolean };

export function TransactionStatementReceiptForm({ endpoint, initialReceipt, mode }: { endpoint: string; initialReceipt: Receipt | null; mode: StatementReceiptMode }) {
  const [receipt, setReceipt] = useState(initialReceipt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [signature, setSignature] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const signing = mode === "sign";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    setSaving(true);
    setError("");
    try {
      const result = await submitJson(endpoint, signing ? { name, signatureDataUrl: signature, acknowledged } : { name });
      setReceipt({ confirmedAt: result.confirmedAt, confirmedBy: result.confirmedBy, signed: result.signed });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "수신확인을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (receipt) return <div className={styles.form}>
    <p className={styles.message} role="status">
      {receipt.signed ? "서명 완료" : "수신확인 완료"} · {receipt.confirmedBy} · {new Date(receipt.confirmedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
    </p>
    <div className={styles.actions}><a className={styles.primary} href={`${endpoint}?download=1`}>{receipt.signed ? "서명본 PDF 다운로드" : "PDF 다운로드"}</a></div>
  </div>;
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.field}>{signing ? "서명자 이름" : "확인자 이름"}<input name="name" autoComplete="name" maxLength={80} required /></label>
      {signing ? <>
        <label className={styles.check}><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} required />거래명세서 내용을 확인했고, 아래 서명을 제출합니다.</label>
        <SignaturePad className={styles.signaturePad} onChange={setSignature} disabled={saving} />
      </> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}><button className={styles.primary} type="submit" disabled={saving || (signing && (!signature || !acknowledged))}>
        {saving ? "저장 중…" : signing ? "서명 제출" : "확인했습니다"}
      </button></div>
    </form>
  );
}
