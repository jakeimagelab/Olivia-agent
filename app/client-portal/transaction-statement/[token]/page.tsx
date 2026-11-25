import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TransactionStatementReceiptForm } from "@/components/quote/TransactionStatementForms";
import styles from "@/components/quote/TransactionStatement.module.css";
import { resolveStatementBusinessDetails } from "@/lib/quote/transactionStatementDetails";
import { statementReceiptEndpoint, statementReceiptTokenHash } from "@/lib/quote/transactionStatementReceipt";
import { loadStatementByReceiptHash } from "@/lib/quote/transactionStatementStore";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "거래명세서 수신확인", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function TransactionStatementReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hash = statementReceiptTokenHash(token);
  const statement = hash ? await loadStatementByReceiptHash(hash) : null;
  if (!statement) notFound();
  const { recipient } = resolveStatementBusinessDetails(statement.snapshot, statement.business_details);
  const mode = statement.receipt_mode ?? "confirm";
  const endpoint = statementReceiptEndpoint(token);
  const receipt = statement.confirmed_at && statement.confirmed_by
    ? { confirmedAt: statement.confirmed_at, confirmedBy: statement.confirmed_by, signed: Boolean(statement.signed_pdf_path) }
    : null;
  return (
    <main className={styles.surface}>
      <section className={styles.card}>
        <h1>{mode === "sign" ? "거래명세서 서명" : "거래명세서 수신확인"}</h1>
        <p className={styles.meta}>{recipient.name} · {statement.statement_number}<br />
          거래일 {statement.transaction_date} · {statement.snapshot.document.finalAmount.toLocaleString("ko-KR")}원
        </p>
        <a className={styles.secondary} href={endpoint} target="_blank" rel="noreferrer">PDF 보기</a>
        <TransactionStatementReceiptForm endpoint={endpoint} initialReceipt={receipt} mode={mode} />
      </section>
    </main>
  );
}
