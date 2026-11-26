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
