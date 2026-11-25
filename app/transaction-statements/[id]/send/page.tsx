import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TransactionStatementMailForm } from "@/components/quote/TransactionStatementForms";
import styles from "@/components/quote/TransactionStatement.module.css";
import { readTransactionStatementSeal } from "@/lib/quote/renderTransactionStatementPdf";
import { matchesStatementSupplier, resolveStatementBusinessDetails, statementMailDefaults } from "@/lib/quote/transactionStatementDetails";
import { transactionStatementPath } from "@/lib/quote/transactionStatementSnapshot";
import { loadTransactionStatement } from "@/lib/quote/transactionStatementStore";

export const dynamic = "force-dynamic";

export default async function TransactionStatementMailPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await cookies()).get("pc_admin_session")?.value !== "active") redirect("/");
  const { id } = await params;
  const statement = await loadTransactionStatement(id);
  if (!statement) notFound();
  const { to, subject } = statementMailDefaults(statement);
  const { supplier, recipient } = resolveStatementBusinessDetails(statement.snapshot, statement.business_details);
  const canSend = !matchesStatementSupplier(supplier) || Boolean(statement.status === "draft" && await readTransactionStatementSeal());
  const signing = statement.receipt_mode === "sign";
  const endpoint = transactionStatementPath(id);
  return (
    <main className={styles.surface}>
      <section className={styles.card}>
        <h1>거래명세서 메일 보내기</h1>
        <p className={styles.meta}>{recipient.name} · {statement.statement_number}</p>
        <div className={styles.actions}>
          <a className={styles.secondary} href={`${endpoint}/pdf`} target="_blank" rel="noreferrer">PDF 보기</a>
          <a className={styles.secondary} href={`${endpoint}/pdf?download=1`}>{statement.signed_pdf_path ? "서명본 PDF 다운로드" : "PDF 다운로드"}</a>
        </div>
        {statement.status === "draft" ? (
          <TransactionStatementMailForm endpoint={`${endpoint}/send`} to={to} subject={subject} updatedAt={statement.updated_at}
            canSend={canSend} unavailableReason="공급자 직인 파일을 등록한 후 발송할 수 있습니다." />
        ) : <p className={styles.meta}>{statement.status === "confirmed" ? (signing ? "고객이 서명했습니다." : "고객이 수신확인했습니다.") : (signing ? "서명 요청 발송 · 서명 대기" : "메일 발송 완료 · 수신확인 대기")}</p>}
      </section>
    </main>
  );
}
