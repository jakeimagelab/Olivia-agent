"use client";

import type { CSSProperties, ReactNode } from "react";

export type WorkspaceActionBarAction = {
  key: string;
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  icon?: ReactNode;
};

type WorkspaceActionBarProps = {
  /* 좌측 상태 텍스트 — 예: "자동 저장됨 · 방금", "씬 12개 · 체크 2/4" */
  status?: ReactNode;
  actions: WorkspaceActionBarAction[];
};

const barStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 20px",
  borderTop: "0.5px solid rgba(21,88,85,.16)",
  background: "#FAF7F2",
};

const statusStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#5A7470",
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

function buttonStyle(variant: "primary" | "secondary", disabled?: boolean): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 34,
    padding: variant === "primary" ? "0 16px" : "0 14px",
    borderRadius: 8,
    fontWeight: variant === "primary" ? 800 : 700,
    fontSize: 12.5,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
  };
  if (variant === "primary") {
    return {
      ...base,
      border: "1px solid #E85D2C",
      background: disabled ? "#F2B79B" : "#E85D2C",
      color: "#fff",
    };
  }
  return {
    ...base,
    border: "1px solid rgba(21,88,85,.3)",
    background: "#fff",
    color: "#155855",
    opacity: disabled ? 0.5 : 1,
  };
}

// 견적서/콘티/일정/사진작업실 네 화면이 공유하는 창 하단 고정 액션 바(OLIVIA OS 1차 작업
// 지시서 2단계). 부모가 `display:flex; flex-direction:column; height:100%`이고 콘텐츠
// 영역이 `flex:1; overflow:auto`일 때, 이 컴포넌트를 그 마지막 형제로 두면 콘텐츠 스크롤과
// 무관하게 바닥에 붙는다 — 컴포넌트 스스로 position:fixed/sticky를 걸지 않는다(부모 스크롤
// 컨테이너 구조를 모르는 채로 고정시키면 어느 부모 구조에선 깨지기 때문).
export default function WorkspaceActionBar({ status, actions }: WorkspaceActionBarProps) {
  if (process.env.NODE_ENV !== "production") {
    const primaryCount = actions.filter((action) => action.variant === "primary").length;
    if (primaryCount > 1) {
      // eslint-disable-next-line no-console
      console.warn(`WorkspaceActionBar: 화면당 오렌지 채움(primary) 버튼은 하나만 — 지금 ${primaryCount}개.`);
    }
  }

  return (
    <div style={barStyle}>
      <div style={statusStyle}>{status}</div>
      <div style={buttonsRowStyle}>
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            style={buttonStyle(action.variant ?? "secondary", action.disabled)}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
