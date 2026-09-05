"use client";

import type { ReactNode } from "react";
import Button from "./Button";

type EmptyStateProps = {
  icon: ReactNode;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

// OLIVIA OS Desktop UI 제안서 1.8 — 아이콘 하나 + 한 줄 안내 + (있다면) 시작 버튼 하나,
// 그 이상 넣지 않는다. 사진작업실의 "사진 폴더를 선택하고 검색을 시작하세요."가 기준 예시다.
export default function EmptyState({ icon, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div style={{
      minHeight: 220, display: "grid", placeItems: "center", alignContent: "center", gap: 14,
      border: ".5px solid var(--line)", borderRadius: 12, background: "var(--panel-bg)", color: "#bec9c6",
    }}>
      {icon}
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>{message}</p>
      {actionLabel && onAction ? <Button variant="secondary" onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}
