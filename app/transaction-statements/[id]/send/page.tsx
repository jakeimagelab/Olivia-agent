import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TransactionStatementMailForm } from "@/components/quote/TransactionStatementForms";
import styles from "@/components/quote/TransactionStatement.module.css";
import { readTransactionStatementSeal } from "@/lib/quote/renderTransactionStatementPdf";
import { statementMailDefaults } from "@/lib/quote/sendTransactionStatement";
import { transactionStatementPath } from "@/lib/quote/transactionStatementSnapshot";
import { loadTransactionStatement } from "@/lib/quote/transactionStatementStore";

export const dynamic = "force-dynamic";

export default async function TransactionStatementMailPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await cookies()).get("pc_admin_session")?.value !== "active") redirect("/");
  const { id } = await params;
  const statement = await loadTransactionStatement(id);
  if (!statement) notFound();
  const { to, subject } = statementMailDefaults(statement);
  const seal = statement.status === "draft" ? await readTransactionStatementSeal() : null;
  const endpoint = transactionStatementPath(id);
  return (
    <main className={styles.surface}>
      <section className={styles.card}>
        <h1>거래명세서 메일 보내기</h1>
        <p className={styles.meta}>{statement.snapshot.document.customer.hospitalName} · {statement.statement_number}</p>
        <a className={styles.secondary} href={`${endpoint}/pdf`} target="_blank" rel="noreferrer">PDF 보기</a>
        {statement.status === "draft" ? (
          <TransactionStatementMailForm endpoint={`${endpoint}/send`} to={to} subject={subject}
            canSend={Boolean(seal)} unavailableReason="공급자 직인 파일을 등록한 후 발송할 수 있습니다." />
        ) : <p className={styles.meta}>{statement.status === "confirmed" ? "고객이 수신확인했습니다." : "메일 발송 완료 · 수신확인 대기"}</p>}
      </section>
    </main>
  );
}
