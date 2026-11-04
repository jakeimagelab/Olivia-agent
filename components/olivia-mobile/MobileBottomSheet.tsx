"use client";

import { useEffect, useId, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./OliviaMobileShell.module.css";

const FOCUSABLE = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export default function MobileBottomSheet({ open, title, description, onClose, children }: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; currentY: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sheet = sheetRef.current;
    const focusables = () => Array.from(sheet?.querySelectorAll<HTMLElement>(FOCUSABLE) || []);
    requestAnimationFrame(() => (focusables()[0] || sheet)?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        sheet?.focus();
        return;
      }
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, currentY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.currentY = event.clientY;
    const offset = Math.max(0, event.clientY - drag.startY);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${offset}px)`;
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (sheetRef.current) sheetRef.current.style.transform = "";
    if (drag.currentY - drag.startY >= 72) onClose();
  };

  return (
    <div className={styles.mobileSheetBackdrop} onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={sheetRef} className={styles.mobileBottomSheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={styles.mobileSheetDragArea} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <span className={styles.mobileSheetHandle} aria-hidden="true" />
        </div>
        <button type="button" className={styles.mobileSheetClose} onClick={onClose} aria-label="닫기"><X size={20} /></button>
        <div className={styles.mobileSheetHeading}>
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {children}
      </section>
    </div>
  );
}
