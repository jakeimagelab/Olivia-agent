"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PenLine } from "lucide-react";
import { SignaturePad } from "@/components/ui/SignaturePad";
import styles from "./DocumentMail.module.css";

export default function ReceivedContractSignForm({ endpoint, contractVersion }: { endpoint: string; contractVersion: string }) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [signature, setSignature] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [receipt, setReceipt] = useState<{ signedAt: string; signerName: string } | null>(null);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (waiting || !signature || !acknowledged) return;
    const name = new FormData(event.currentTarget).get("name");
    requestId.current ??= crypto.randomUUID();
    setWaiting(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, signatureDataUrl: signature, acknowledged, contractVersion, requestId: requestId.current }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error || "서명을 저장하지 못했습니다. 다시 시도해 주세요.");
      setReceipt({ signedAt: result.signedAt, signerName: result.signerName });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "서명을 저장하지 못했습니다.");
    } finally {
      setWaiting(false);
    }
  }

  return <section className={styles.section} aria-label="계약서 전자서명">
    <h2>{receipt ? "서명 완료" : "계약서 전자서명"}</h2>
    {receipt ? <div className={styles.form}>
      <p className={styles.notice} role="status">{receipt.signerName} 님의 서명을 저장했습니다.</p>
      <div className={styles.actions}><a className={styles.button} href={`${endpoint}?kind=contract&download=1`}>서명본 PDF 다운로드</a></div>
    </div> : <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <p className={styles.notice}>계약서 내용을 확인하고 서명하면 서명본 PDF를 내려받을 수 있습니다.</p>
      <label className={styles.field}>서명자 이름<input name="name" maxLength={80} autoComplete="name" readOnly={waiting} required /></label>
      <label className={styles.check}><input type="checkbox" required checked={acknowledged} disabled={waiting} onChange={(event) => setAcknowledged(event.target.checked)} />
        <span>계약서 내용을 모두 확인했고, 위 내용에 동의하여 전자서명합니다.</span>
      </label>
      <SignaturePad className={styles.signaturePad} onChange={setSignature} disabled={waiting} />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={waiting || !signature || !acknowledged}>
          <PenLine size={15} aria-hidden /> {waiting ? "서명 저장 중…" : "동의하고 서명"}
        </button>
      </div>
    </form>}
  </section>;
}
