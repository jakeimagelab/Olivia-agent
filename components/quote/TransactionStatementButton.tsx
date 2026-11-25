"use client";

import { useEffect, useRef, useState } from "react";
import { loadQuoteStatements, openQuoteStatement, type StatementWorkspaceOpening } from "@/lib/quote/transactionStatementClient";
import type { StatementSummary } from "@/lib/quote/transactionStatementDetails";
import styles from "./TransactionStatement.module.css";

export function TransactionStatementButton({ quoteId, onPrepare, onOpen }: {
  quoteId: string;
  onPrepare: () => void;
  onOpen: (request: Promise<StatementWorkspaceOpening>) => void;
}) {
  const listRequest = useRef<Promise<StatementSummary[]> | null>(null);
  const [hasStatement, setHasStatement] = useState<boolean | null>(null);

  useEffect(() => {
    const request = listRequest.current ??= loadQuoteStatements(quoteId).then(({ statements }) => statements);
    let active = true;
    void request.then((statements) => { if (active) setHasStatement(statements.length > 0); }).catch(() => {
      if (listRequest.current === request) listRequest.current = null;
    });
    return () => { active = false; };
  }, [quoteId]);

  function open() {
    const request = openQuoteStatement(quoteId, listRequest.current ?? undefined);
    // The editor handles failures when its chunk finishes loading.
    void request.catch(() => undefined);
    onOpen(request);
  }

  return <div className={styles.inline}>
    <button className={styles.secondary} type="button" onPointerEnter={onPrepare} onFocus={onPrepare} onClick={open}>
      {hasStatement ? "거래명세서 열기" : "＋ 거래명세서 만들기"}
    </button>
  </div>;
}
