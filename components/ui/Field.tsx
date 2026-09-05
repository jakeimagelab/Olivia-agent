"use client";

import type { CSSProperties, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  required?: boolean;
  children: ReactNode;
  style?: CSSProperties;
};

// OLIVIA OS Desktop UI 제안서 1.6 — 라벨 12px, 필드와 간격 5px, 필수 항목은 라벨 옆 붉은 별표.
export default function Field({ label, required, children, style }: FieldProps) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: "var(--muted)", ...style }}>
      <span>
        {label}
        {required ? <span style={{ color: "var(--danger)", marginLeft: 4 }}>*</span> : null}
      </span>
      {children}
    </label>
  );
}

const inputBase: CSSProperties = {
  border: ".5px solid var(--line)",
  borderRadius: 7,
  padding: "0 10px",
  fontFamily: "inherit",
  fontSize: 13,
  color: "var(--ink)",
  background: "#fff",
  outline: "none",
};

// 1.6 — 높이 34px(한 줄), 56px(여러 줄). Field의 children으로 쓰는 기본 입력 구현체 —
// 화면이 자체 입력을 쓰고 싶으면 Field만 쓰고 이 컴포넌트들은 안 써도 된다.
export function FieldInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputBase, height: 34, ...props.style }} />;
}

export function FieldTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...inputBase, height: 56, padding: "8px 10px", resize: "vertical", ...props.style }} />;
}
