"use client";

import type { ReactNode } from "react";
import { C, ProgressBar } from "./PhotoSortingUi";

export type PhotoClassificationProgress = {
  cur: number;
  total: number;
  msg: string;
};

export function PhotoClassificationProgressView({
  title,
  titleColor = C.teal,
  progress,
  statusText,
  hideProgressUntilStarted = false,
  emptyMessage = "스캔 중...",
  logs,
  logLimit = 40,
  logColor = () => C.green,
  details,
  notice,
  onCancel,
  cancelLabel = "중단",
  maxWidth = 560,
}: {
  title: string;
  titleColor?: string;
  progress: PhotoClassificationProgress;
  statusText?: string;
  hideProgressUntilStarted?: boolean;
  emptyMessage?: string;
  logs?: string[];
  logLimit?: number;
  logColor?: (line: string) => string;
  details?: ReactNode;
  notice?: ReactNode;
  onCancel?: () => void;
  cancelLabel?: string;
  maxWidth?: number;
}) {
  const showProgress = !hideProgressUntilStarted || progress.total > 0;

  return (
    <div style={{ maxWidth, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: titleColor }}>{title}</div>
      {statusText ? <div style={{ fontSize: 11, color: C.muted }}>{statusText}</div> : null}
      {showProgress ? (
        <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg} />
      ) : (
        <div style={{ fontSize: 12, color: C.hint }}>{progress.msg || emptyMessage}</div>
      )}
      {logs ? (
        <div
          style={{
            maxHeight: 260,
            overflowY: "auto",
            fontSize: 11,
            fontFamily: "monospace",
            background: "#F8FFFE",
            borderRadius: 8,
            padding: 12,
            border: `1px solid ${C.border}`,
          }}
        >
          {logs.slice(-logLimit).map((line, index) => (
            <div key={`${index}-${line}`} style={{ color: logColor(line) }}>
              {line}
            </div>
          ))}
        </div>
      ) : null}
      {details ? (
        <div style={{ fontSize: 11, color: C.hint, lineHeight: 1.7, whiteSpace: "pre-line" }}>
          {details}
        </div>
      ) : null}
      {notice ? <div style={{ fontSize: 11, color: C.hint }}>{notice}</div> : null}
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "8px 16px",
            background: "transparent",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 12,
            cursor: "pointer",
            color: C.muted,
            fontFamily: "inherit",
            alignSelf: "flex-start",
          }}
        >
          {cancelLabel}
        </button>
      ) : null}
    </div>
  );
}
