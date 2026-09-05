"use client";

import { Minus, Square, X } from "lucide-react";
import styles from "./AppWindow.module.css";

// macOS 스타일 traffic-light — 평소엔 색 원만 보이고, hover 시에만 글리프(×/−/□)가 나타난다
// (참고 이미지 요청에 따라 이전의 "복제하지 않는다" 결정을 뒤집음). 클릭 핸들러는 그대로.
export function WindowHeader({
  title, onPointerDown, onDoubleClick, onClose, onMinimize, onToggleMaximize,
}: {
  title: string;
  onPointerDown: (event: React.PointerEvent) => void;
  onDoubleClick: () => void;
  onClose?: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}) {
  return (
    <div className={styles.header} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
      <div className={styles.controls}>
        {onClose ? (
          <button type="button" aria-label="닫기" className={`${styles.trafficLight} ${styles.trafficLightClose}`} onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>
            <X size={7} strokeWidth={3} className={styles.trafficLightGlyph} />
          </button>
        ) : <span className={`${styles.trafficLight} ${styles.trafficLightClose} ${styles.trafficLightDisabled}`} aria-hidden="true" />}
        <button type="button" aria-label="최소화" className={`${styles.trafficLight} ${styles.trafficLightMinimize}`} onPointerDown={(event) => event.stopPropagation()} onClick={onMinimize}>
          <Minus size={7} strokeWidth={3} className={styles.trafficLightGlyph} />
        </button>
        <button type="button" aria-label="최대화" className={`${styles.trafficLight} ${styles.trafficLightMaximize}`} onPointerDown={(event) => event.stopPropagation()} onClick={onToggleMaximize}>
          <Square size={6} strokeWidth={3} className={styles.trafficLightGlyph} />
        </button>
      </div>
      <div className={styles.title}>{title}</div>
      <div style={{ width: 60, flexShrink: 0 }} aria-hidden="true" />
    </div>
  );
}
