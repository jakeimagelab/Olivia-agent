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
    borderRadius: "var(--ui-radius-control, 10px)",
    fontWeight: 600,
    fontSize: 12.5,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "transform 160ms cubic-bezier(.32,.72,0,1), background 160ms cubic-bezier(.32,.72,0,1), border-color 160ms ease, color 160ms ease",
  };
  if (variant === "primary") {
    return {
      ...base,
      border: "1px solid var(--ui-orange-strong, #C94C22)",
      background: disabled ? "transparent" : "var(--ui-orange-strong, #C94C22)",
      color: disabled ? "var(--ui-text-secondary, #626D65)" : "#fff",
      boxShadow: disabled ? "none" : "0 1px 2px rgba(201,76,34,.22), 0 6px 16px rgba(201,76,34,.16)",
    };
  }
  if (variant === "danger") {
    return {
      ...base,
      border: "1px solid rgba(220,38,38,.35)",
      background: "var(--ui-surface, #FCFBF8)",
      color: "var(--danger)",
      opacity: 1,
    };
  }
  return {
    ...base,
    border: `1px solid ${disabled ? "var(--ui-border, #D5DBD3)" : "color-mix(in srgb, var(--ui-brand-green, #155855) 34%, var(--ui-border, #D5DBD3))"}`,
    background: "var(--ui-surface, #FCFBF8)",
    color: disabled ? "var(--ui-text-secondary, #626D65)" : "var(--ui-brand-green, #155855)",
    opacity: 1,
  };
}

export default function Button({ variant = "secondary", icon, children, style, disabled, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-ui-variant={variant}
      className={["olivia-ui-button", className].filter(Boolean).join(" ")}
      style={{ ...styleFor(variant, disabled), ...style }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
