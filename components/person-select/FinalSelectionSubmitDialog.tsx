"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ImageIcon, X } from "lucide-react";
import styles from "./FinalSelectionSubmitDialog.module.css";

export type FinalSelectionReviewSection = {
  label: string;
  count: number;
  detail?: string;
};

export type FinalSelectionReviewItem = {
  id: string;
  fileName: string;
  thumbnailUrl?: string | null;
  detail?: string;
};

export function FinalSelectionSubmitDialog({
  selectedCount,
  sections,
  items,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  selectedCount: number;
  sections: FinalSelectionReviewSection[];
  items: FinalSelectionReviewItem[];
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { cancelRef.current?.focus(); }, []);

  return <div className={styles.backdrop} onMouseDown={(event) => {
    if (!busy && event.currentTarget === event.target) onCancel();
  }}>
    <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="final-selection-review-title" aria-describedby="final-selection-review-description" onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!busy) onCancel();
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex='-1'])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }}>
      <header className={styles.header}>
        <div className={styles.titleIcon}><CheckCircle2 size={20} /></div>
        <div>
          <p>마지막 확인</p>
          <h2 id="final-selection-review-title">최종 선택 확인</h2>
        </div>
        <button type="button" aria-label="닫기" disabled={busy} onClick={onCancel}><X size={18} /></button>
      </header>

      <div className={styles.body}>
        <div className={styles.notice} id="final-selection-review-description">
          <strong>자동 저장된 선택은 아직 최종본이 아닙니다.</strong>
          <span>아래 내용을 확인한 뒤 마지막 확인 버튼을 눌러야 포토클리닉에 최종 전달됩니다.</span>
        </div>

        <div className={styles.total}><span>최종 선택</span><strong>{selectedCount.toLocaleString("ko-KR")}장</strong></div>

        {sections.length ? <div className={styles.sections}>{sections.map((section) => <div key={section.label}>
          <span>{section.label}</span>
          <strong>{section.count.toLocaleString("ko-KR")}장</strong>
          {section.detail ? <small>{section.detail}</small> : null}
        </div>)}</div> : null}

        <section className={styles.photoReview} aria-label="최종 선택 사진">
          <header><strong>선택한 사진</strong><span>파일명을 한 번 더 확인해 주세요.</span></header>
          <div className={styles.items}>{items.slice(0, 12).map((item) => <article key={item.id}>
            {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" /> : <span className={styles.placeholder}><ImageIcon size={18} /></span>}
            <div><strong title={item.fileName}>{item.fileName}</strong>{item.detail ? <small>{item.detail}</small> : null}</div>
          </article>)}</div>
          {selectedCount > Math.min(12, items.length) ? <p className={styles.more}>위 {Math.min(12, items.length)}장 외 {selectedCount - Math.min(12, items.length)}장이 함께 제출됩니다.</p> : null}
        </section>

        <label className={styles.confirmCheck}>
          <input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
          <span><strong>선택 사진과 보정 요청을 최종 확인했습니다.</strong><small>제출 후 변경하려면 다시 선택하고 재제출해야 합니다.</small></span>
        </label>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>

      <footer className={styles.footer}>
        <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>돌아가서 수정</button>
        <button type="button" className={styles.primary} disabled={!confirmed || busy} onClick={onConfirm}>{busy ? "제출 중…" : "확인하고 최종 제출"}</button>
      </footer>
    </section>
  </div>;
}
