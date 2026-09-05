"use client";

import type { CSSProperties, ReactNode } from "react";
import Button, { type ButtonVariant } from "./Button";

export type ActionBarAction = {
  key: string;
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  icon?: ReactNode;
};

type ActionBarProps = {
  /* 좌측 상태 텍스트 — 예: "자동 저장됨 · 방금", "필수 2개 중 2개 입력됨", "4 / 218 선택" */
  status?: ReactNode;
  actions: ActionBarAction[];
};

const barStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 20px",
  borderTop: ".5px solid var(--line)",
  background: "var(--ivory)",
};

const statusStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--muted)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: 0,
};

const buttonsRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginLeft: "auto",
  flexShrink: 0,
};

// OLIVIA OS Desktop UI 제안서 1.4 + 3단계 — components/ui/WorkspaceActionBar.tsx(1차 작업
// 2단계)를 그대로 옮겼다. 화면당 하나만 쓰는 컴포넌트를 두 벌 유지하지 않기 위해 원본은
// 삭제하고 QuoteBuilder.tsx의 import만 이쪽으로 옮겼다(동작 변경 없음).
export default function ActionBar({ status, actions }: ActionBarProps) {
  if (process.env.NODE_ENV !== "production") {
    const primaryCount = actions.filter((action) => action.variant === "primary").length;
    if (primaryCount > 1) {
      console.warn(`ActionBar: 화면당 오렌지 채움(primary) 버튼은 하나만 — 지금 ${primaryCount}개.`);
    }
  }

  return (
    <div style={barStyle}>
      <div style={statusStyle}>{status}</div>
      <div style={buttonsRowStyle}>
        {actions.map((action) => (
          <Button
            key={action.key}
            variant={action.variant ?? "secondary"}
            disabled={action.disabled}
            icon={action.icon}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
