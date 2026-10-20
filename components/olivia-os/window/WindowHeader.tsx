"use client";

import { Minus, Square, X } from "lucide-react";
import styles from "./AppWindow.module.css";

// macOS 스타일 traffic-light. 닫기 X는 창마다 항상 보여서 종료 동작을 바로 알 수 있게 한다.
export function WindowHeader({
  title, compatibilityMode = false, onPointerDown, onDoubleClick, onClose, onMinimize, onToggleMaximize,
}: {
  title: string;
  compatibilityMode?: boolean;
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
            <X size={9} strokeWidth={2.6} className={styles.trafficLightGlyph} />
          </button>
        ) : <span className={`${styles.trafficLight} ${styles.trafficLightClose} ${styles.trafficLightDisabled}`} aria-hidden="true" />}
        <button type="button" aria-label="최소화" className={`${styles.trafficLight} ${styles.trafficLightMinimize}`} onPointerDown={(event) => event.stopPropagation()} onClick={onMinimize}>
          <Minus size={7} strokeWidth={3} className={styles.trafficLightGlyph} />
        </button>
        <button type="button" aria-label="최대화" className={`${styles.trafficLight} ${styles.trafficLightMaximize}`} onPointerDown={(event) => event.stopPropagation()} onClick={onToggleMaximize}>
          <Square size={6} strokeWidth={3} className={styles.trafficLightGlyph} />
        </button>
      </div>
      <div className={styles.titleArea}>
        <div className={styles.title}>{title}</div>
        {compatibilityMode ? (
          <span
            className={styles.compatibilityBadge}
            tabIndex={0}
            aria-describedby="olivia-compatibility-tooltip"
            onPointerDown={(event) => event.stopPropagation()}
          >
            호환 화면
            <span id="olivia-compatibility-tooltip" role="tooltip" className={styles.compatibilityTooltip}>
              단축키와 대화 컨텍스트 연동이 제한됩니다
            </span>
          </span>
        ) : null}
      </div>
      <div style={{ width: 60, flexShrink: 0 }} aria-hidden="true" />
    </div>
  );
}
