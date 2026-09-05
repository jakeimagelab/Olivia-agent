"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
  children?: ReactNode;
};

// OLIVIA OS Desktop UI 제안서 3단계 — components/ui 프리미티브. 1.2("오렌지는 화면당 하나")
// 규칙을 코드로 강제하진 못하지만, primary를 쓸 때마다 이 스타일이 나오게 해서 최소한
// "무엇이 primary인지"를 매번 다시 정의하지 않게 한다. 기존 WorkspaceActionBar.tsx의
// buttonStyle()을 그대로 옮겼다 — 새 스타일을 만든 게 아니라 이미 화면에 쓰이던 걸 추출했다.
function styleFor(variant: ButtonVariant, disabled?: boolean): CSSProperties {
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
    transition: "transform 160ms cubic-bezier(.32,.72,0,1), background 160ms cubic-bezier(.32,.72,0,1)",
  };
  if (variant === "primary") {
    return {
      ...base,
      border: "1px solid var(--orange)",
      background: disabled ? "#F2B79B" : "var(--orange)",
      color: "#fff",
    };
  }
  if (variant === "danger") {
    return {
      ...base,
      border: "1px solid rgba(220,38,38,.35)",
      background: "#fff",
      color: "var(--danger)",
      opacity: disabled ? 0.5 : 1,
    };
  }
  return {
    ...base,
    border: ".5px solid var(--line)",
    background: "#fff",
    color: "var(--teal)",
    opacity: disabled ? 0.5 : 1,
  };
}

export default function Button({ variant = "secondary", icon, children, style, disabled, ...rest }: ButtonProps) {
  return (
    <button type="button" disabled={disabled} style={{ ...styleFor(variant, disabled), ...style }} {...rest}>
      {icon}
      {children}
    </button>
  );
}
