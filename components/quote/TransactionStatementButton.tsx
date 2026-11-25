"use client";

import { useState } from "react";
import { transactionStatementMailPage, transactionStatementPath } from "@/lib/quote/transactionStatementSnapshot";
import styles from "./TransactionStatement.module.css";

export function TransactionStatementButton({ quoteId }: { quoteId: string }) {
  const [pending, setPending] = useState(false);
  const [id, setId] = useState<string>();
  const [error, setError] = useState("");

  async function create() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/transaction-statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.statement?.id) throw new Error(result?.error || "거래명세서를 만들지 못했습니다.");
      setId(result.statement.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "생성하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return <div className={styles.inline}>
    <button className={styles.secondary} type="button" disabled={pending} onClick={() => void create()}>
      {pending ? "만드는 중…" : "＋ 거래명세서 만들기"}
    </button>
    {id ? <div className={styles.actions}>
      <a className={styles.secondary} href={`${transactionStatementPath(id)}/pdf`} target="_blank" rel="noreferrer">PDF 보기</a>
      <a className={styles.secondary} href={transactionStatementMailPage(id)} target="_blank" rel="noreferrer">메일 보내기</a>
    </div> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </div>;
}
