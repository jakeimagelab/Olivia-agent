"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Mail } from "lucide-react";
import { ModalCloseButton } from "@/components/ui/ModalCloseButton";
import {
  DOCUMENT_MAIL_LABELS, type DocumentMailKind, type DocumentMailPreview, type DocumentMailReference,
} from "@/lib/document-mail/shared";
import styles from "./DocumentMail.module.css";

const ENDPOINT = "/api/admin/document-mail";
const KINDS = Object.keys(DOCUMENT_MAIL_LABELS) as DocumentMailKind[];

export default function DocumentMailPanel({ anchor, onClose }: { anchor: DocumentMailReference; onClose: () => void }) {
  const titleId = useId();
  const recipientRef = useRef<HTMLInputElement>(null);
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const [preview, setPreview] = useState<DocumentMailPreview | null>(null);
  const [selected, setSelected] = useState<Partial<Record<DocumentMailKind, string>>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { kind, id } = anchor;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ kind, id });
    void fetch(`${ENDPOINT}?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "발송할 문서 목록을 불러오지 못했습니다.");
        const data = payload.preview as DocumentMailPreview;
        const defaultSelection: Partial<Record<DocumentMailKind, string>> = { [kind]: id };
        if (kind !== "statement") {
          const companion = data.documents.filter((document) => document.kind === (kind === "quote" ? "contract" : "quote"));
          if (companion.length === 1) defaultSelection[companion[0].kind] = companion[0].id;
        }
        setSelected(defaultSelection);
        setPreview(data);
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "문서를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [id, kind]);

  useEffect(() => { if (preview) recipientRef.current?.focus(); }, [preview]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, sending]);

  const documents = preview?.documents.filter((document) => selected[document.kind] === document.id) ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !documents.length) return;
    const form = new FormData(event.currentTarget);
    requestId.current ??= crypto.randomUUID();
    submitting.current = true;
    setSending(true);
    setError("");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchor, documents: documents.map(({ kind, id, version }) => ({ kind, id, version })),
          requestId: requestId.current, confirmed: true, to: form.get("to"), subject: form.get("subject"), message: form.get("message"),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        if (result?.code === "NOT_SENT") requestId.current = null;
        throw new Error(result?.error || "발송 결과를 확인할 수 없습니다. 잠시 후 같은 요청을 확인해 주세요.");
      }
      setSent(result.recordingWarning || `${String(form.get("to"))}에 문서 ${result.documentCount}건을 보냈습니다.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "메일을 보내지 못했습니다.");
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <aside className={styles.panel} aria-labelledby={titleId}>
      <header className={styles.header}>
        <h2 id={titleId}>메일 보내기</h2>
        {!sending && <ModalCloseButton onClick={onClose} />}
      </header>
      {sent ? <div className={styles.form}><p role="status">{sent}</p><div className={styles.actions}>
        <button className={styles.button} type="button" onClick={onClose}>닫기</button>
      </div></div> : preview ? <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <label className={styles.field}>받는 메일 주소<input ref={recipientRef} name="to" type="email" defaultValue={preview.recipient} maxLength={254} required readOnly={sending} /></label>
        <label className={styles.field}>제목<input name="subject" defaultValue={preview.subject} maxLength={200} required readOnly={sending} /></label>
        <label className={styles.field}>내용<textarea name="message" defaultValue={preview.message} rows={6} maxLength={5000} required readOnly={sending} /></label>
        <fieldset className={styles.selection} disabled={sending}>
          <legend>함께 보낼 문서</legend>
          {KINDS.map((type) => {
            const choices = preview.documents.filter((document) => document.kind === type);
            if (!choices.length) return <label className={`${styles.choice} ${styles.unavailable}`} key={type}>
              <input type="checkbox" disabled /> <span>{DOCUMENT_MAIL_LABELS[type]}<small className={styles.small}>연결된 문서가 없습니다.</small></span>
            </label>;
            return choices.map((choice) => <label className={styles.choice} key={choice.id}>
              <input type="checkbox" checked={selected[type] === choice.id} onChange={(event) => {
                setSelected((previous) => ({ ...previous, [type]: event.target.checked ? choice.id : undefined }));
              }} />
              <span><strong>{DOCUMENT_MAIL_LABELS[type]}</strong> {choice.number}
                <small className={styles.small}>{choice.title}{choice.requiresSignature ? " · 전자서명 요청" : type === "contract" ? " · 서명본" : ""}</small></span>
            </label>);
          })}
        </fieldset>
        {preview.latest && <p className={styles.notice}>최근 발송 · {preview.latest.recipient} · {new Date(preview.latest.sentAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>}
        <p className={styles.notice}>{documents.length ? "고객에게 선택한 문서만 열리는 링크를 보냅니다." : "보낼 문서를 선택해 주세요."}</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={!documents.length || sending}>
            <Mail size={15} aria-hidden /> {sending ? "보내는 중…" : `선택한 문서 ${documents.length}건 보내기`}
          </button>
        </div>
      </form> : <p role={error ? "alert" : "status"} className={error ? styles.error : styles.notice}>{error || "문서를 불러오는 중…"}</p>}
    </aside>, document.body,
  );
}
