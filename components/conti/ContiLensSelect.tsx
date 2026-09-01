"use client";

const LENSES = ["24-70mm", "35mm", "85mm", "135mm"] as const;

export default function ContiLensSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const legacy = value && !LENSES.includes(value as (typeof LENSES)[number]);
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="구도 렌즈" style={{ width: "100%", minHeight: 36, border: "1px solid rgba(21,88,85,.2)", borderRadius: 6, background: "#fff", color: "#374151", font: "inherit" }}>
      <option value="">렌즈 선택</option>
      {legacy ? <option value={value}>{value} (기존 값)</option> : null}
      {LENSES.map((lens) => <option key={lens} value={lens}>{lens}</option>)}
    </select>
  );
}
