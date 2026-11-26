import type { Metadata } from "next";
import { Download, FileText } from "lucide-react";
import ReceivedContractSignForm from "@/components/document-mail/ReceivedContractSignForm";
import styles from "@/components/document-mail/DocumentMail.module.css";
import { loadReceivedDocuments, visibleDeliveredDocuments } from "@/lib/document-mail/repository";
import { DOCUMENT_MAIL_LABELS, receivedDocumentsApi } from "@/lib/document-mail/shared";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "받은 문서 | Olivia", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function ReceivedDocumentsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const delivery = await loadReceivedDocuments(getSupabaseAdmin(), token);
  if (!delivery) return <main className={styles.portal}><section className={styles.section}>
    <h2>문서를 열 수 없습니다</h2>
    <p className={styles.notice}>링크가 만료되었거나 올바르지 않습니다. 담당자에게 새 링크를 요청해 주세요.</p>
  </section></main>;
  const endpoint = receivedDocumentsApi(token);
  const documents = visibleDeliveredDocuments(delivery);
  const contract = documents.find((item) => item.kind === "contract");
  const canSign = Boolean(contract && !contract.signed && delivery.contract_id && delivery.contract_sha256 && delivery.contract_html);

  return <main className={styles.portal}>
    <header className={styles.portalHeader}>
      <img src="/assets/photoclinic-logo.png" alt="포토클리닉" />
      <h1>받은 문서</h1>
      <p className={styles.notice}>{delivery.customer_name}에 전달한 문서입니다. {new Date(delivery.expires_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}까지 열 수 있습니다.</p>
    </header>
    <section className={styles.section} aria-label="받은 문서 목록">
      {documents.map((item) => {
        const pdf = `${endpoint}?kind=${item.kind}`;
        return <article className={styles.row} key={item.kind}>
          <FileText size={21} aria-hidden />
          <div>
            <small className={styles.small}>{DOCUMENT_MAIL_LABELS[item.kind]}{item.number ? ` · ${item.number}` : ""}</small>
            <h3>{item.title}</h3>
            {item.signed && <small className={styles.small}>서명 완료 · {item.signed.name} · {new Date(item.signed.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</small>}
          </div>
          <div className={styles.actions}>
            <a className={styles.button} href={pdf} target="_blank" rel="noreferrer" aria-label={`${DOCUMENT_MAIL_LABELS[item.kind]} PDF 보기`}>PDF 보기</a>
            <a className={styles.button} href={`${pdf}&download=1`} aria-label={`${DOCUMENT_MAIL_LABELS[item.kind]} ${item.signed ? "서명본 " : ""}다운로드`}>
              <Download size={14} aria-hidden />{item.signed ? "서명본 다운로드" : "다운로드"}
            </a>
          </div>
        </article>;
      })}
    </section>
    {canSign && delivery.contract_sha256 && <ReceivedContractSignForm endpoint={endpoint} contractVersion={delivery.contract_sha256} />}
  </main>;
}
