"use client";

export const C = {
  teal: "#4FD8B8",
  orange: "#C94A1E",
  green: "#A8F1DC",
  surface: "rgba(255,255,255,.025)",
  border: "rgba(255,255,255,.13)",
  muted: "rgba(255,255,255,.52)",
  hint: "rgba(255,255,255,.42)",
  txt: "rgba(255,255,255,.88)",
  light: "rgba(255,255,255,.045)",
  bg: "rgba(0,0,0,.16)",
  red: "#ED8177",
  yellow: "#D97706",
  purple: "#7C3AED",
  darkPanel: "#2A2A2A",
  darkAction: "#37C39D",
  darkActionText: "#103E36",
  darkSelected: "#4FD8B8",
} as const;

export function Btn({ onClick, disabled, children, variant = "primary", style }: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    height: 42,
    padding: "0 22px",
    border: "1px solid transparent",
    borderRadius: 10,
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background .15s, border-color .15s, color .15s",
  };
  const variants = {
    primary: { background: "#37C39D", color: "#103E36" },
    secondary: { background: C.surface, color: C.teal, borderColor: "rgba(255,255,255,.18)" },
    danger: { background: C.red, color: "rgba(255,255,255,.92)" },
  };
  const disabledStyle: React.CSSProperties = disabled
    ? { background: "transparent", borderColor: "rgba(168,181,178,.30)", color: "#A8B5B2", opacity: 1 }
    : {};
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style, ...disabledStyle }}>
      {children}
    </button>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

export function ProgressBar({ cur, total, msg }: { cur: number; total: number; msg: string }) {
  const percent = total > 0 ? Math.round((cur / total) * 100) : 0;
  return (
    <Card>
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{cur} / {total}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.teal }}>{percent}%</span>
        </div>
        <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ height: "100%", width: `${percent}%`, background: C.teal, borderRadius: 4, transition: "width .2s" }} />
        </div>
        <div style={{ fontSize: 11, color: C.hint, wordBreak: "break-all" }}>{msg}</div>
      </div>
    </Card>
  );
}

export function SectionPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: color + "18", borderRadius: 20, border: `1px solid ${color}30` }}>
      <span style={{ fontSize: 11, fontWeight: 500, color }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>{count}장</span>
    </div>
  );
}

export function Toggle({ label, desc, value, onChange }: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.txt }}>{label}</div>
        {desc && <div style={{ fontSize: 10, color: C.hint, marginTop: 2, lineHeight: 1.5 }}>{desc}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{ flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: value ? C.teal : C.border, position: "relative", transition: "background .2s", fontFamily: "inherit" }}>
        <span style={{ position: "absolute", top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "rgba(255,255,255,.88)", transition: "left .2s", display: "block" }} />
      </button>
    </div>
  );
}
