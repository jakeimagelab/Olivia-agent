"use client";

import { useEffect, useState } from "react";
import { createQuoteStatement, loadQuoteStatements } from "@/lib/quote/transactionStatementClient";
import styles from "./TransactionStatement.module.css";

export function TransactionStatementButton({ quoteId, onOpen }: { quoteId: string; onOpen: (id: string) => void }) {
  const [pending, setPending] = useState(false);
  const [hasStatement, setHasStatement] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void loadQuoteStatements(quoteId, controller.signal)
      .then(({ statements }) => { if (!controller.signal.aborted) setHasStatement(statements.length > 0); })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "거래명세서를 읽지 못했습니다.");
      });
    return () => controller.abort();
  }, [quoteId]);

  async function open() {
    setPending(true);
    setError("");
    try {
      const { statements } = await loadQuoteStatements(quoteId);
      const statement = statements[0] ?? (await createQuoteStatement(quoteId)).statement;
      onOpen(statement.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "생성하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  const loading = hasStatement === null && !error;
  return <div className={styles.inline}>
    <button className={styles.secondary} type="button" disabled={pending || loading} onClick={() => void open()}>
      {pending || loading ? "거래명세서 준비 중…" : hasStatement ? "거래명세서 열기" : "＋ 거래명세서 만들기"}
    </button>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </div>;
}
