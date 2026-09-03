"use client";

import { Minus, Square, X } from "lucide-react";
import styles from "./AppWindow.module.css";

// macOS traffic-light를 그대로 복제하지 않는다(스펙 1-6) — 색 원 대신 작은 neutral 아이콘
// 버튼으로 close/minimize/maximize를 왼쪽에 둔다.
export function WindowHeader({
  title, onPointerDown, onDoubleClick, onClose, onMinimize, onToggleMaximize,
}: {
  title: string;
  onPointerDown: (event: React.PointerEvent) => void;
  onDoubleClick: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}) {
  return (
    <div className={styles.header} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
      <div className={styles.controls}>
        <button type="button" aria-label="닫기" className={`${styles.controlButton} ${styles.closeButton}`} onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>
          <X size={13} />
        </button>
        <button type="button" aria-label="최소화" className={styles.controlButton} onPointerDown={(event) => event.stopPropagation()} onClick={onMinimize}>
          <Minus size={13} />
        </button>
        <button type="button" aria-label="최대화" className={styles.controlButton} onPointerDown={(event) => event.stopPropagation()} onClick={onToggleMaximize}>
          <Square size={11} />
        </button>
      </div>
      <div className={styles.title}>{title}</div>
      <div style={{ width: 74, flexShrink: 0 }} aria-hidden="true" />
    </div>
  );
}
