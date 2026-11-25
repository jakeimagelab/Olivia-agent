"use client";

import { useState, type FormEvent } from "react";
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
  endpoint, to, subject, canSend, unavailableReason,
}: {
  endpoint: string;
  to: string;
  subject: string;
  canSend: boolean;
  unavailableReason: string;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError("");
    try {
      await submitJson(endpoint, { to: form.get("to"), subject: form.get("subject"), confirmed: true });
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "메일을 발송하지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  if (sent) return <p className={styles.message} role="status">메일을 보냈습니다. 고객이 포털에서 확인하면 PDF에 기록됩니다.</p>;
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.field}>받는 사람<input name="to" type="email" defaultValue={to} maxLength={254} required /></label>
      <label className={styles.field}>제목<input name="subject" defaultValue={subject} maxLength={250} required /></label>
      <p className={styles.message}>거래명세서 PDF와 수신확인 링크를 함께 보냅니다.</p>
      {!canSend ? <p className={styles.message}>{unavailableReason}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button className={styles.primary} type="submit" disabled={!canSend || sending}>{sending ? "보내는 중…" : "확인하고 메일 보내기"}</button>
      </div>
    </form>
  );
}

type Receipt = { confirmedAt: string; confirmedBy: string };

export function TransactionStatementReceiptForm({ endpoint, initialReceipt }: { endpoint: string; initialReceipt: Receipt | null }) {
  const [receipt, setReceipt] = useState(initialReceipt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    setSaving(true);
    setError("");
    try {
      const result = await submitJson(endpoint, { name });
      setReceipt({ confirmedAt: result.confirmedAt, confirmedBy: result.confirmedBy });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "수신확인을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (receipt) return <p className={styles.message} role="status">
    수신확인 완료 · {receipt.confirmedBy} · {new Date(receipt.confirmedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
  </p>;
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.field}>확인자 이름<input name="name" autoComplete="name" maxLength={80} required /></label>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}><button className={styles.primary} type="submit" disabled={saving}>{saving ? "저장 중…" : "확인했습니다"}</button></div>
    </form>
  );
}
