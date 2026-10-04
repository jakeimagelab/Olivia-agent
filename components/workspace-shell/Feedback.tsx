"use client";

import { Inbox } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./WorkspaceShell.module.css";

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return <div className={styles.emptyState}>{icon ?? <Inbox size={24} />}<strong>{title}</strong>{description ? <p>{description}</p> : null}</div>;
}

export function ProgressCard({ label, progress, children }: { label: string; progress: number; children?: ReactNode }) {
  const normalized = Math.max(0, Math.min(100, progress));
  return <div className={styles.progressCard}><strong>{label}</strong>{children}<div className={styles.progressTrack}><i style={{ width: `${normalized}%` }} /></div></div>;
}

export function Toast({ children }: { children: ReactNode }) {
  return <div className={styles.toast} role="status">{children}</div>;
}

export function ConfirmDialog({ title, description, confirmLabel = "확인", cancelLabel = "취소", onConfirm, onCancel }: {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);
  return (
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="workspace-confirm-title" aria-describedby="workspace-confirm-description">
        <h2 id="workspace-confirm-title">{title}</h2>
        <p id="workspace-confirm-description">{description}</p>
        <div className={styles.dialogActions}>
          <button ref={cancelRef} type="button" className="pc-btn pc-btn--secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="pc-btn pc-btn--primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
