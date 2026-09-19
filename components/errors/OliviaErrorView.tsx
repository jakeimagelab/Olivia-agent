"use client";

import { formatOliviaErrorDetails } from "@/lib/errors/errorDiagnostics";
import styles from "./OliviaErrorView.module.css";

type OliviaErrorViewProps = {
  error: unknown;
  title?: string;
  description?: string;
  location?: string;
  compact?: boolean;
  onRetry?: () => void;
  onGoHome?: () => void;
};

export function OliviaErrorView({
  error,
  title = "화면을 불러오지 못했습니다.",
  description = "아래 오류 정보를 확인한 뒤 다시 시도해 주세요.",
  location,
  compact = false,
  onRetry,
  onGoHome,
}: OliviaErrorViewProps) {
  const rawDetails = formatOliviaErrorDetails(error);

  return (
    <section className={`${styles.shell}${compact ? ` ${styles.compact}` : ""}`} role="alert">
      <div className={styles.card}>
        <p className={styles.eyebrow}>OLIVIA ERROR</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
        {location ? <p className={styles.location}>발생 위치 · {location}</p> : null}
        <details className={styles.details}>
          <summary>오류 원문 보기</summary>
          <pre className={styles.diagnostic}>{rawDetails}</pre>
        </details>
        {onRetry || onGoHome ? (
          <div className={styles.actions}>
            {onRetry ? <button type="button" className={styles.primary} onClick={onRetry}>다시 시도</button> : null}
            {onGoHome ? <button type="button" className={styles.secondary} onClick={onGoHome}>OLIVIA 홈으로</button> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
